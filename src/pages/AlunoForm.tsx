import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { Area, AlunoStatus, CanalContato } from "../types";
import { TAGS_SELECIONAVEIS_POR_AREA } from "../utils/tags";
import { AREA_CONFIG } from "../config/areas";
import { ArrowLeft, Save } from "lucide-react";
import "./AlunoForm.css";

const AlunoForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { getAluno, addAluno, updateAluno, isLoadingAlunos } = useAlunos();
  const { user } = useAuth();
  const { showToast } = useToast();
  const isEditing = !!id;

  // Cada atalho de funil abre o mesmo formulário, já configurado para sua
  // área. Ao editar, a área existente sempre prevalece.
  const isEngajamento = !isEditing && location.pathname.startsWith("/engajamento");
  const isRetencao = !isEditing && location.pathname.startsWith("/retencao");

  // Quando o cadastro é aberto a partir de "Meus Contatos" (?paraMim=1), o
  // aluno já nasce atribuído a quem está criando, em vez de entrar sem
  // responsável na aba Alunos — ver botão "Novo Contato" em
  // MeusContatosEngajamento.tsx.
  const paraMim = new URLSearchParams(location.search).get("paraMim") === "1";

  const existingAluno = isEditing ? getAluno(id!) : null;

  // Área efetiva deste formulário: ao editar, é a área que o aluno já tem
  // hoje (pode ser qualquer uma das 3, já que o card de qualquer Kanban
  // sempre abre em /alunos/:id/edit); ao criar, é fixa conforme o modo.
  const effectiveArea: Area = isEditing
    ? existingAluno?.area || "rematricula"
    : isEngajamento
    ? "engajamento"
    : isRetencao
    ? "retencao"
    : "rematricula";

  const areaConfig = AREA_CONFIG[effectiveArea];

  // Retenção ainda não tem etiquetas próprias definidas; usa o conjunto de
  // Rematrícula como padrão até que isso seja decidido.
  const tagsSelecionaveis =
    TAGS_SELECIONAVEIS_POR_AREA[
      effectiveArea === "engajamento" ? "engajamento" : "rematricula"
    ];

  const buildFormData = React.useCallback(
    () => ({
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
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [existingAluno]
  );

  const [formData, setFormData] = useState(buildFormData);
  // Controla se já preenchemos o formulário com os dados reais do aluno
  // (evita sobrescrever o que o usuário já digitou, caso a lista termine
  // de carregar bem depois que ele já começou a editar).
  const [hasHydrated, setHasHydrated] = useState(!isEditing);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Enquanto a lista de alunos ainda está carregando do banco, "não
  // encontrado" ainda não é um veredito confiável — só decidimos isso
  // depois que o carregamento inicial terminou.
  useEffect(() => {
    if (!isEditing || isLoadingAlunos) return;

    if (!existingAluno) {
      showToast("Aluno não encontrado!", "error");
      navigate("/alunos");
      return;
    }

    if (!hasHydrated) {
      setFormData(buildFormData());
      setHasHydrated(true);
    }
  }, [isEditing, isLoadingAlunos, existingAluno, hasHydrated, buildFormData, navigate, showToast]);

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

  const turnos = ["Matutino", "Vespertino", "Noturno", "EAD"];

  if (isEditing && !hasHydrated) {
    return (
      <div className="lead-form-page">
        <div className="lead-form-header">
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
            <span>Voltar</span>
          </button>
          <h1>Editar Aluno</h1>
        </div>
        <div className="lead-form-container">
          <p>Carregando dados do aluno...</p>
        </div>
      </div>
    );
  }

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
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

  const validate = (): boolean => {
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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate() || !user) return;

    setIsSubmitting(true);

    try {
      // No modo Engajamento o atendente não escolhe/marca essas tags: o
      // sistema aplica "Calouro" e "Nova Matrícula" automaticamente ao
      // salvar (ver README.md seção 4-5).
      const tags = isEngajamento
        ? Array.from(new Set([...formData.tags, "Calouro", "Nova Matrícula"]))
        : formData.tags;

      const alunoData = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        ra: formData.ra.trim() || undefined,
        curso: formData.curso.trim() || undefined,
        turno: formData.turno.trim() || undefined,
        status: isEngajamento ? areaConfig.statusInicial : formData.status,
        source: formData.source,
        value: formData.value ? parseFloat(formData.value) : undefined,
        observations: formData.observations.trim() || undefined,
        tags,
      };

      if (isEditing) {
        // Edição nunca muda a área do aluno — só o que já existe no form.
        await updateAluno(id!, alunoData);
        showToast("Aluno atualizado com sucesso!", "success");
        navigate(`/alunos/${id}`);
      } else {
        await addAluno({
          ...alunoData,
          area: effectiveArea,
          statusAtualizadoEm: new Date(),
          createdBy: user.id,
          assignedTo: paraMim ? user.id : undefined,
        });
        showToast(
          paraMim ? "Contato criado e atribuído a você!" : "Aluno criado com sucesso!",
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
        <form onSubmit={handleSubmit} className="lead-form">
          {/* Informações Básicas */}
          <div className="form-section">
            <h2>Informações Básicas</h2>
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
                <label htmlFor="ra">RA / Matrícula</label>
                <input
                  type="text"
                  id="ra"
                  name="ra"
                  value={formData.ra}
                  onChange={handleChange}
                  placeholder="Número de matrícula"
                />
              </div>

              <div className="form-group">
                <label htmlFor="curso">Curso</label>
                <input
                  type="text"
                  id="curso"
                  name="curso"
                  value={formData.curso}
                  onChange={handleChange}
                  placeholder="Nome do curso"
                />
              </div>

              <div className="form-group">
                <label htmlFor="turno">Turno</label>
                <select
                  id="turno"
                  name="turno"
                  value={formData.turno}
                  onChange={handleChange}
                >
                  <option value="">Selecione</option>
                  {turnos.map((turno) => (
                    <option key={turno} value={turno}>
                      {turno}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Status e Canal */}
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

              <div className="form-group">
                <label htmlFor="value">Débito/Valor Pendente (R$)</label>
                <input
                  type="number"
                  id="value"
                  name="value"
                  value={formData.value}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>
          </div>

          {/* Observações e Tags */}
          <div className="form-section">
            <h2>Informações Adicionais</h2>
            <div className="form-group">
              <label>Tags</label>
              <div className="tags-picker">
                {tagsSelecionaveis.map((tag) => {
                  const selected = formData.tags.includes(tag);
                  return (
                    <button
                      type="button"
                      key={tag}
                      className={`tag-chip${selected ? " tag-chip-selected" : ""}`}
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
                placeholder="Informações adicionais sobre o aluno..."
                rows={4}
              />
            </div>
          </div>

          {/* Botões */}
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate(-1)}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
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
        </form>
      </div>
    </div>
  );
};

export default AlunoForm;
