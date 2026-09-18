import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { Area, AlunoStatus, CanalContato } from "../types";
import { TAGS_SELECIONAVEIS_POR_AREA } from "../utils/tags";
import { AREA_CONFIG } from "../config/areas";
import { normalizarRa, normalizarNomeAluno } from "../services/alunosService";
import { temAcessoArea } from "../utils/areaAccess";
import { ArrowLeft, Save, ChevronLeft, ChevronRight, UserPlus, Users } from "lucide-react";
import DelegarContatoModal from "../components/DelegarContatoModal";
import "./AlunoForm.css";

type Etapa = 1 | 2 | 3;

const CAMPOS_ETAPA: Record<Etapa, string[]> = {
  1: ["name", "email", "phone", "ra", "curso", "turno"],
  2: ["status", "source", "setorId", "value"],
  3: ["tags", "observations"],
};

const AlunoForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    getAluno,
    addAluno,
    updateAluno,
    assumirAluno,
    isLoadingAlunos,
    canGerenciarPolo,
    alunos,
    colaboradores,
    setores,
  } = useAlunos();
  const { user } = useAuth();
  const { showToast } = useToast();
  const isEditing = !!id;

  const isEngajamento = !isEditing && location.pathname.startsWith("/engajamento");
  const isRetencao = !isEditing && location.pathname.startsWith("/retencao");

  const paraMim = new URLSearchParams(location.search).get("paraMim") === "1";

  const existingAluno = isEditing ? getAluno(id!) : null;

  const effectiveArea: Area = isEditing
    ? existingAluno?.area || "rematricula"
    : isEngajamento
    ? "engajamento"
    : isRetencao
    ? "retencao"
    : "rematricula";

  const areaConfig = AREA_CONFIG[effectiveArea];

  const buildFormData = () => ({
    name: existingAluno?.name || "",
    email: existingAluno?.email || "",
    phone: existingAluno?.phone || "",
    ra: existingAluno?.ra || "",
    curso: existingAluno?.curso || "",
    turno: existingAluno?.turno || "",
    status: existingAluno?.status || areaConfig.statusInicial,
    source: existingAluno?.source || ("telefone" as CanalContato),
    value: existingAluno?.value?.toString() || "",
    observations: existingAluno?.observations || "",
    tags: existingAluno?.tags || ([] as string[]),
    setorId:
      existingAluno?.setorId ||
      (effectiveArea === "engajamento" ? user?.setorId || "" : ""),
    // Atribuicao: create — colaborador pode "assumir"; gestor pode delegar.
    assignedTo: existingAluno?.assignedTo || (paraMim ? user?.id || "" : ""),
  });

  const [formData, setFormData] = useState(buildFormData);
  const [hasHydrated, setHasHydrated] = useState(!isEditing);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>(1);
  const [mostrarDelegar, setMostrarDelegar] = useState(false);
  const [assumindo, setAssumindo] = useState(false);

  const contatosParecidos = React.useMemo(() => {
    if (isEditing) return [];
    const nomeNorm = normalizarNomeAluno(formData.name);
    const raNorm = normalizarRa(formData.ra);
    if (!nomeNorm && !raNorm) return [];

    type Hit = { aluno: (typeof alunos)[0]; motivo: "ra" | "nome" };
    const hits: Hit[] = [];

    for (const a of alunos) {
      const aRa = a.ra ? normalizarRa(a.ra) : "";
      const aNome = normalizarNomeAluno(a.name);
      if (raNorm && aRa && aRa === raNorm) {
        hits.push({ aluno: a, motivo: "ra" });
        continue;
      }
      // Nome exatamente igual (normalizado) — avisa no cadastro
      if (nomeNorm.length >= 3 && aNome && aNome === nomeNorm) {
        hits.push({ aluno: a, motivo: "nome" });
      }
    }

    // Prioriza RA, depois nome; no máximo 5
    hits.sort((x, y) => (x.motivo === "ra" ? 0 : 1) - (y.motivo === "ra" ? 0 : 1));
    return hits.slice(0, 5);
  }, [isEditing, formData.name, formData.ra, alunos]);

  useEffect(() => {
    if (!isEditing) return;
    if (isLoadingAlunos) return;
    if (!existingAluno) {
      showToast("Aluno não encontrado!", "error");
      navigate(-1);
      return;
    }
    if (!temAcessoArea(user, existingAluno.area)) {
      showToast("Você não tem acesso a esta área.", "error");
      navigate(-1);
      return;
    }
    if (
      !canGerenciarPolo &&
      existingAluno.assignedTo &&
      existingAluno.assignedTo !== user?.id
    ) {
      showToast("Você não tem permissão para editar este contato.", "error");
      navigate(-1);
      return;
    }
    if (!hasHydrated) {
      setFormData(buildFormData());
      setHasHydrated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, isLoadingAlunos, existingAluno, hasHydrated, navigate, showToast, canGerenciarPolo, user, id]);

  const statuses: { value: AlunoStatus; label: string }[] = areaConfig.statuses.map(
    (status) => ({ value: status, label: areaConfig.getLabel(status) })
  );

  const sources: { value: CanalContato; label: string }[] = [
    { value: "telefone", label: "Telefone" },
    { value: "whatsapp", label: "WhatsApp" },
    { value: "email", label: "E-mail" },
    { value: "presencial", label: "Presencial" },
    { value: "ava", label: "AVA / Portal do Aluno" },
    { value: "indicacao", label: "Indicação" },
    { value: "outro", label: "Outro" },
  ];

  const tagsSelecionaveis = TAGS_SELECIONAVEIS_POR_AREA[effectiveArea] || [];

  if (isEditing && !hasHydrated) {
    return (
      <div className="lead-form-page">
        <p>Carregando...</p>
      </div>
    );
  }

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const toggleTag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter((t) => t !== tag)
        : [...prev.tags, tag],
    }));
  };

  const coletarErros = (): Record<string, string> => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Nome é obrigatório";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email é obrigatório";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Email inválido";
    }

    if (!formData.phone.trim()) {
      newErrors.phone = "Telefone é obrigatório";
    }

    if (!formData.ra.trim()) {
      newErrors.ra = "RA / Matrícula é obrigatório";
    }

    if (effectiveArea === "engajamento" && !formData.setorId) {
      newErrors.setorId = "Setor é obrigatório no Engajamento";
    }

    return newErrors;
  };

  const etapaDoPrimeiroErro = (errs: Record<string, string>): Etapa => {
    const camposComErro = Object.keys(errs);
    for (const e of [1, 2, 3] as Etapa[]) {
      if (CAMPOS_ETAPA[e].some((c) => camposComErro.includes(c))) {
        return e;
      }
    }
    return 1;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors = coletarErros();
    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      const destino = etapaDoPrimeiroErro(newErrors);
      setEtapa(destino);
      showToast(
        "Preencha os campos obrigatórios destacados para continuar.",
        "error"
      );
      return;
    }

    if (!user) return;
    if (!user.poloId) {
      showToast(
        "Seu usuário não tem um polo definido. Peça a um admin para configurar seu polo antes de cadastrar alunos.",
        "error"
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const tags = isEngajamento
        ? Array.from(new Set([...formData.tags, "Calouro", "Nova Matrícula"]))
        : formData.tags;

      const alunoData = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        ra: formData.ra.trim(),
        curso: formData.curso.trim() || undefined,
        turno: formData.turno.trim() || undefined,
        status: isEngajamento ? areaConfig.statusInicial : formData.status,
        source: formData.source,
        value: formData.value ? parseFloat(formData.value) : undefined,
        observations: formData.observations.trim() || undefined,
        tags,
      };

      if (isEditing) {
        await updateAluno(id!, {
          ...alunoData,
          ...(effectiveArea === "engajamento"
            ? { setorId: formData.setorId || undefined }
            : {}),
        });
        showToast("Aluno atualizado com sucesso!", "success");
        navigate(`/alunos/${id}`);
      } else {
        await addAluno({
          ...alunoData,
          area: effectiveArea,
          statusAtualizadoEm: new Date(),
          createdBy: user.id,
          poloId: user.poloId,
          assignedTo: formData.assignedTo || undefined,
          ...(effectiveArea === "engajamento" && formData.setorId
            ? { setorId: formData.setorId }
            : {}),
        });
        showToast(
          paraMim
            ? "Contato criado e atribuído a você!"
            : "Aluno criado com sucesso!",
          "success"
        );
        navigate(
          paraMim
            ? "/engajamento/meus-contatos"
            : isEngajamento
            ? "/engajamento"
            : isRetencao
            ? "/retencao"
            : "/alunos"
        );
      }
    } catch (error) {
      console.error("Erro ao salvar aluno:", error);
      showToast("Erro ao salvar aluno. Tente novamente.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const tituloEtapa: Record<Etapa, string> = {
    1: "Informações básicas",
    2: "Classificação",
    3: "Informações adicionais",
  };

  return (
    <div className="lead-form-page">
      <div className="lead-form-header">
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
          <span>Voltar</span>
        </button>
        <h1>
          {isEditing
            ? "Editar Aluno"
            : isEngajamento
            ? paraMim
              ? "Novo Contato · Meus Contatos"
              : "Novo Aluno · Engajamento"
            : isRetencao
            ? "Novo Aluno · Retenção"
            : "Novo Aluno"}
        </h1>
      </div>

      <div className="lead-form-container">
        <nav className="form-steps" aria-label="Etapas do formulário">
          {([1, 2, 3] as Etapa[]).map((n) => (
            <button
              key={n}
              type="button"
              className={`form-step${etapa === n ? " form-step--active" : ""}${
                etapa > n ? " form-step--done" : ""
              }`}
              onClick={() => setEtapa(n)}
            >
              <span className="form-step-num">{n}</span>
              <span className="form-step-label">{tituloEtapa[n]}</span>
            </button>
          ))}
        </nav>

        <form onSubmit={handleSubmit} className="lead-form">
          {contatosParecidos.length > 0 && (
            <div className="form-duplicado-aviso" role="status">
              <strong>
                {contatosParecidos.some((h) => h.motivo === "ra")
                  ? "Possível duplicidade de RA (normalizado em 10 dígitos)"
                  : "Possível duplicidade de nome"}
              </strong>
              <ul>
                {contatosParecidos.map(({ aluno: a, motivo }) => {
                  const resp =
                    colaboradores.find((c) => c.id === a.assignedTo)?.name ||
                    (a.assignedTo ? "outro colaborador" : "sem responsável");
                  return (
                    <li key={`${a.id}-${motivo}`}>
                      <span>{a.name}</span>
                      {a.ra ? (
                        <span>
                          {" "}
                          · RA {a.ra} ({normalizarRa(a.ra)})
                        </span>
                      ) : null}
                      <span>
                        {" "}
                        · motivo: {motivo === "ra" ? "mesmo RA" : "mesmo nome"}
                      </span>
                      <span> · {resp}</span>
                      <span> · {a.area}</span>
                    </li>
                  );
                })}
              </ul>
              <p>
                O RA é comparado só com números, em 10 dígitos (sem pontos ou
                traços). Mesmo RA bloqueia o cadastro ao salvar; mesmo nome
                apenas avisa — confira antes de criar de novo. Se precisar
                tratar o contato existente, peça delegação ao responsável ou
                fale com o admin/supervisor.
              </p>
            </div>
          )}

          {etapa === 1 && (
            <div className="form-section">
              <h2>Informações básicas</h2>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="name">
                    Nome <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className={errors.name ? "error" : ""}
                    placeholder="Nome completo do aluno"
                  />
                  {errors.name && (
                    <span className="error-message">{errors.name}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="email">
                    Email <span className="required">*</span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className={errors.email ? "error" : ""}
                    placeholder="email@exemplo.com"
                  />
                  {errors.email && (
                    <span className="error-message">{errors.email}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="phone">
                    Telefone <span className="required">*</span>
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className={errors.phone ? "error" : ""}
                    placeholder="(00) 00000-0000"
                  />
                  {errors.phone && (
                    <span className="error-message">{errors.phone}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="ra">
                    RA / Matrícula <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="ra"
                    name="ra"
                    value={formData.ra}
                    onChange={handleChange}
                    className={errors.ra ? "error" : ""}
                    placeholder="Somente números (normalizado em 10 dígitos)"
                  />
                  {formData.ra.trim() && normalizarRa(formData.ra) && (
                    <span className="form-hint">
                      Normalizado: {normalizarRa(formData.ra)}
                    </span>
                  )}
                  {errors.ra && (
                    <span className="error-message">{errors.ra}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="curso">Curso</label>
                  <input
                    type="text"
                    id="curso"
                    name="curso"
                    value={formData.curso}
                    onChange={handleChange}
                    placeholder="Ex.: Administração"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="turno">Turno</label>
                  <input
                    type="text"
                    id="turno"
                    name="turno"
                    value={formData.turno}
                    onChange={handleChange}
                    placeholder="Ex.: Noite"
                  />
                </div>


              </div>
            </div>
          )}

          {etapa === 2 && (
            <div className="form-section">
              <h2>Classificação</h2>
              <div className="form-grid">
                {!isEngajamento && (
                  <div className="form-group">
                    <label htmlFor="status">Status</label>
                    <select
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                    >
                      {statuses.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="source">Canal de Contato</label>
                  <select
                    id="source"
                    name="source"
                    value={formData.source}
                    onChange={handleChange}
                  >
                    {sources.map((source) => (
                      <option key={source.value} value={source.value}>
                        {source.label}
                      </option>
                    ))}
                  </select>
                </div>

                {effectiveArea === "engajamento" && (
                  <div className="form-group">
                    <label htmlFor="setorId">
                      Setor <span className="required">*</span>
                    </label>
                    <select
                      id="setorId"
                      name="setorId"
                      value={formData.setorId}
                      onChange={handleChange}
                      className={errors.setorId ? "error" : ""}
                      disabled={!canGerenciarPolo}
                    >
                      <option value="">Selecione o setor</option>
                      {setores
                        .filter((s) =>
                          user?.poloId ? s.poloId === user.poloId : true
                        )
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nome}
                          </option>
                        ))}
                    </select>
                    {errors.setorId && (
                      <span className="error-message">{errors.setorId}</span>
                    )}
                    {!canGerenciarPolo && user?.setorNome && (
                      <span className="form-hint">
                        Seu setor: {user.setorNome}
                      </span>
                    )}
                    {canGerenciarPolo &&
                      formData.assignedTo &&
                      formData.setorId &&
                      (() => {
                        const colab = colaboradores.find(
                          (c) => c.id === formData.assignedTo
                        );
                        if (colab?.setorId && colab.setorId === formData.setorId) {
                          return (
                            <span className="form-hint">
                              Setor preenchido pelo colaborador
                              {colab.setorNome ? ` (${colab.setorNome})` : ""}.
                            </span>
                          );
                        }
                        return null;
                      })()}
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="value">Débito/Valor Pendente (R$)</label>
                  <input
                    type="number"
                    id="value"
                    name="value"
                    value={formData.value}
                    onChange={handleChange}
                    placeholder="0,00"
                    min="0"
                    step="0.01"
                  />
                </div>

                {/* Responsável — Assumir / Delegar conforme política */}
                <div className="form-group form-group--full">
                  <label>Responsável pelo contato</label>
                  <div className="form-responsavel-box">
                    <p className="form-hint" style={{ marginTop: 0 }}>
                      {formData.assignedTo
                        ? `Atual: ${
                            colaboradores.find((c) => c.id === formData.assignedTo)?.name ||
                            (formData.assignedTo === user?.id ? (user?.name || "Você") : "Colaborador")
                          }`
                        : "Sem responsável"}
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                      {/* Colaborador: assume se ainda não tem dono (criação ou edição) */}
                      {!canGerenciarPolo && !formData.assignedTo && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={assumindo}
                          onClick={async () => {
                            if (!user) return;
                            if (isEditing && id) {
                              setAssumindo(true);
                              try {
                                await assumirAluno(id);
                                setFormData((prev) => ({
                                  ...prev,
                                  assignedTo: user.id,
                                  setorId: user.setorId || prev.setorId,
                                }));
                                showToast("Contato assumido com sucesso.", "success");
                              } catch {
                                showToast("Erro ao assumir contato.", "error");
                              } finally {
                                setAssumindo(false);
                              }
                            } else {
                              setFormData((prev) => ({
                                ...prev,
                                assignedTo: user.id,
                                setorId: user.setorId || prev.setorId,
                              }));
                              showToast("Contato será atribuído a você ao salvar.", "success");
                            }
                          }}
                        >
                          <UserPlus size={16} />
                          {assumindo ? "Assumindo..." : "Assumir contato"}
                        </button>
                      )}
                      {/* Colaborador já com assignedTo = eu: pode desmarcar na criação */}
                      {!canGerenciarPolo && !isEditing && formData.assignedTo === user?.id && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            setFormData((prev) => ({ ...prev, assignedTo: "" }))
                          }
                        >
                          Remover atribuição
                        </button>
                      )}
                      {/* Gestor: delegar */}
                      {canGerenciarPolo && (
                        <>
                          {isEditing && existingAluno ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setMostrarDelegar(true)}
                            >
                              <Users size={16} />
                              {formData.assignedTo ? "Reatribuir contato" : "Delegar contato"}
                            </button>
                          ) : (
                            <select
                              className="filter-select"
                              style={{ minWidth: 220 }}
                              value={formData.assignedTo}
                              onChange={(e) => {
                                const colabId = e.target.value;
                                const colab = colaboradores.find((c) => c.id === colabId);
                                setFormData((prev) => ({
                                  ...prev,
                                  assignedTo: colabId,
                                  // Se o colaborador já tem setor, herda automaticamente
                                  ...(colab?.setorId
                                    ? { setorId: colab.setorId }
                                    : {}),
                                }));
                                if (colab?.setorId && errors.setorId) {
                                  setErrors((prev) => ({ ...prev, setorId: "" }));
                                }
                              }}
                            >
                              <option value="">Sem responsável</option>
                              {colaboradores.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                  {c.setorNome ? ` · ${c.setorNome}` : ""}
                                </option>
                              ))}
                            </select>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {etapa === 3 && (
            <div className="form-section">
              <h2>Informações adicionais</h2>
              <div className="form-group">
                <label>Tags</label>
                <div className="tags-picker">
                  {tagsSelecionaveis.map((tag) => {
                    const selected = formData.tags.includes(tag);
                    return (
                      <button
                        type="button"
                        key={tag}
                        className={`tag-chip${
                          selected ? " tag-chip-selected" : ""
                        }`}
                        onClick={() => toggleTag(tag)}
                        aria-pressed={selected}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
                <small>
                  {isEngajamento
                    ? 'Clique para adicionar outras etiquetas. "Calouro" e "Nova Matrícula" são aplicadas automaticamente ao salvar.'
                    : "Clique para adicionar ou remover uma etiqueta"}
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="observations">Observações</label>
                <textarea
                  id="observations"
                  name="observations"
                  value={formData.observations}
                  onChange={handleChange}
                  placeholder="Informacoes adicionais sobre o aluno..."
                  rows={4}
                ></textarea>
              </div>
            </div>
          )}

          <div className="form-actions form-actions--steps">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate(-1)}
              disabled={isSubmitting}
            >
              Cancelar
            </button>

            <div className="form-actions-right">
              {etapa > 1 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEtapa((e) => (e - 1) as Etapa)}
                  disabled={isSubmitting}
                >
                  <ChevronLeft size={18} />
                  Anterior
                </button>
              )}

              {etapa < 3 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEtapa((e) => (e + 1) as Etapa)}
                  disabled={isSubmitting}
                >
                  Próximo
                  <ChevronRight size={18} />
                </button>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                <Save size={18} />
                <span>
                  {isSubmitting
                    ? "Salvando..."
                    : isEditing
                    ? "Salvar Alterações"
                    : "Criar Aluno"}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
      {mostrarDelegar && existingAluno && (
        <DelegarContatoModal
          aluno={existingAluno}
          onClose={() => {
            setMostrarDelegar(false);
            const atualizado = getAluno(id!);
            if (atualizado) {
              setFormData((prev) => ({
                ...prev,
                assignedTo: atualizado.assignedTo || "",
              }));
            }
          }}
        />
      )}
    </div>
  );
};

export default AlunoForm;