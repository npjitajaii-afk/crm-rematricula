import React, { useEffect, useMemo, useState } from "react";
import {
  getUsuarios,
  definirStatusUsuario,
  definirAreasUsuario,
  definirPoloUsuario,
  definirRoleUsuario,
  definirSetorUsuario,
  apagarUsuario,
} from "../services/usuariosService";
import { Usuario, Area, UserRole } from "../types";
import { AREA_CONFIG } from "../config/areas";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import { useAlunos } from "../hooks/useAlunos";
import {
  UserCog,
  Check,
  X,
  Clock,
  ShieldCheck,
  Loader2,
  UserX,
  Search,
  MapPin,
  Trash2,
} from "lucide-react";
import { formatDate } from "../utils/formatters";
import "./Usuarios.css";

const TODAS_AREAS: Area[] = ["rematricula", "retencao", "engajamento"];

/** Regra de negócio confirmada: colaborador tem no máximo 2 áreas liberadas
 * simultaneamente (nem todos têm acesso a duas — pode ser só 1). Ver
 * README.md, Bloco C. */
const MAX_AREAS_POR_COLABORADOR = 2;

/** Role "admin" não aparece no seletor — só existe um admin (já vinculado
 * a um polo) e promover alguém a admin é uma decisão manual (SQL), fora
 * desta tela. Aqui o admin só alterna entre supervisor e colaborador. */
const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  colaborador: "Colaborador",
};

const STATUS_INFO: Record<Usuario["status"], { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "status-chip-pendente" },
  aprovado: { label: "Aprovado", className: "status-chip-aprovado" },
  rejeitado: { label: "Recusado", className: "status-chip-rejeitado" },
};

const Usuarios: React.FC = () => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { polos, setores } = useAlunos();

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  /** null = todos os polos; "__sem__" = sem polo; uuid = polo específico */
  const [poloFiltro, setPoloFiltro] = useState<string | null>(null);

  const carregar = async () => {
    setIsLoading(true);
    const { usuarios: lista, error } = await getUsuarios();
    if (error) {
      showToast(error, "error");
    } else {
      setUsuarios(lista);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const termoBusca = busca.trim().toLowerCase();

  const passaBusca = (u: Usuario) => {
    if (!termoBusca) return true;
    return (
      u.name.toLowerCase().includes(termoBusca) ||
      u.email.toLowerCase().includes(termoBusca)
    );
  };

  const passaPolo = (u: Usuario) => {
    if (poloFiltro === null) return true;
    if (poloFiltro === "__sem__") return !u.poloId;
    return u.poloId === poloFiltro;
  };

  const pendentes = useMemo(
    () => usuarios.filter((u) => u.status === "pendente" && passaBusca(u) && passaPolo(u)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usuarios, termoBusca, poloFiltro]
  );

  const demais = useMemo(
    () => usuarios.filter((u) => u.status !== "pendente" && passaBusca(u) && passaPolo(u)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usuarios, termoBusca, poloFiltro]
  );

  /** Agrupa os demais usuários por polo (card por polo). */
  const gruposPorPolo = useMemo(() => {
    const mapa = new Map<string, { poloId: string | null; nome: string; usuarios: Usuario[] }>();
    for (const u of demais) {
      const key = u.poloId || "__sem__";
      if (!mapa.has(key)) {
        const nome =
          key === "__sem__"
            ? "Sem polo"
            : polos.find((p) => p.id === u.poloId)?.nome || "Polo";
        mapa.set(key, { poloId: u.poloId || null, nome, usuarios: [] });
      }
      mapa.get(key)!.usuarios.push(u);
    }
    // Ordena: polos por nome, "Sem polo" no fim
    return Array.from(mapa.values()).sort((a, b) => {
      if (!a.poloId) return 1;
      if (!b.poloId) return -1;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [demais, polos]);

  const contagemPorPolo = useMemo(() => {
    const base = usuarios.filter((u) => u.status !== "pendente" && passaBusca(u));
    const map: Record<string, number> = { todos: base.length, __sem__: 0 };
    for (const p of polos) map[p.id] = 0;
    for (const u of base) {
      if (!u.poloId) map.__sem__ += 1;
      else if (map[u.poloId] !== undefined) map[u.poloId] += 1;
      else map[u.poloId] = 1;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarios, termoBusca, polos]);

  const aprovar = async (usuario: Usuario) => {
    setSavingId(usuario.id);
    // Antes concedia as 3 áreas de cara ("admin ajusta depois"). Como
    // ninguém pode ter mais de 2 áreas simultâneas, aprovar já com 3 seria
    // conceder acesso inválido por alguns instantes até o admin corrigir.
    // Agora aprova sem nenhuma área marcada — o admin escolhe explicitamente
    // até 2 nos checkboxes logo abaixo.
    const { error } = await definirStatusUsuario(usuario.id, "aprovado", []);
    if (error) {
      showToast(error, "error");
    } else {
      showToast(
        `${usuario.name} aprovado(a). Marque até ${MAX_AREAS_POR_COLABORADOR} áreas de acesso abaixo.`,
        "success"
      );
      setUsuarios((prev) =>
        prev.map((u) => (u.id === usuario.id ? { ...u, status: "aprovado", areasPermitidas: [] } : u))
      );
    }
    setSavingId(null);
  };

  const recusar = async (usuario: Usuario) => {
    const ok = await confirm(`Recusar o cadastro de ${usuario.name}? Ele(a) não vai conseguir logar.`, {
      danger: true,
      confirmLabel: "Recusar",
    });
    if (!ok) return;

    setSavingId(usuario.id);
    const { error } = await definirStatusUsuario(usuario.id, "rejeitado");
    if (error) {
      showToast(error, "error");
    } else {
      showToast(`Cadastro de ${usuario.name} recusado`, "success");
      setUsuarios((prev) => prev.map((u) => (u.id === usuario.id ? { ...u, status: "rejeitado" } : u)));
    }
    setSavingId(null);
  };

  const revogarAcesso = async (usuario: Usuario) => {
    const ok = await confirm(`Revogar o acesso de ${usuario.name}? Ele(a) vai deixar de conseguir logar.`, {
      danger: true,
      confirmLabel: "Revogar",
    });
    if (!ok) return;

    setSavingId(usuario.id);
    const { error } = await definirStatusUsuario(usuario.id, "rejeitado");
    if (error) {
      showToast(error, "error");
    } else {
      showToast(`Acesso de ${usuario.name} revogado`, "success");
      setUsuarios((prev) => prev.map((u) => (u.id === usuario.id ? { ...u, status: "rejeitado" } : u)));
    }
    setSavingId(null);
  };

  const reativar = async (usuario: Usuario) => {
    setSavingId(usuario.id);
    // Antes caía pra TODAS_AREAS se o colaborador não tivesse nenhuma área
    // salva — violaria o limite de 2. Mantém o que ele já tinha (respeita
    // o limite, pois nunca deveria ter passado de 2) ou reativa sem
    // nenhuma área marcada, deixando o admin escolher.
    const areas = usuario.areasPermitidas.slice(0, MAX_AREAS_POR_COLABORADOR);
    const { error } = await definirStatusUsuario(usuario.id, "aprovado", areas);
    if (error) {
      showToast(error, "error");
    } else {
      showToast(`${usuario.name} reativado(a)`, "success");
      setUsuarios((prev) => prev.map((u) => (u.id === usuario.id ? { ...u, status: "aprovado", areasPermitidas: areas } : u)));
    }
    setSavingId(null);
  };

  /** Apaga o usuário de forma permanente. Só admin (esta tela já é AdminRoute)
   * e o banco bloqueia apagar a si mesmo ou outro admin. */
  const apagar = async (usuario: Usuario) => {
    if (usuario.role === "admin") {
      showToast("Não é permitido apagar um administrador.", "error");
      return;
    }

    const ok = await confirm(
      `Apagar permanentemente ${usuario.name} (${usuario.email})? Esta ação não pode ser desfeita.`,
      {
        danger: true,
        confirmLabel: "Apagar usuário",
      }
    );
    if (!ok) return;

    setSavingId(usuario.id);
    const { error } = await apagarUsuario(usuario.id);
    if (error) {
      showToast(error, "error");
    } else {
      showToast(`${usuario.name} foi apagado(a).`, "success");
      setUsuarios((prev) => prev.filter((u) => u.id !== usuario.id));
    }
    setSavingId(null);
  };

  const toggleArea = async (usuario: Usuario, area: Area) => {
    const jaTem = usuario.areasPermitidas.includes(area);

    if (!jaTem && usuario.areasPermitidas.length >= MAX_AREAS_POR_COLABORADOR) {
      showToast(
        `Cada colaborador pode ter no máximo ${MAX_AREAS_POR_COLABORADOR} áreas liberadas ao mesmo tempo. Desmarque uma antes de marcar outra.`,
        "error"
      );
      return;
    }

    // Liberar Engajamento exige setor já definido (trigger no banco também valida).
    if (!jaTem && area === "engajamento" && !usuario.setorId) {
      showToast(
        "Defina o setor do colaborador antes de liberar a área Engajamento.",
        "error"
      );
      return;
    }

    const novasAreas = jaTem
      ? usuario.areasPermitidas.filter((a) => a !== area)
      : [...usuario.areasPermitidas, area];

    // Atualização otimista
    setUsuarios((prev) =>
      prev.map((u) => (u.id === usuario.id ? { ...u, areasPermitidas: novasAreas } : u))
    );
    setSavingId(usuario.id);

    const { error } = await definirAreasUsuario(usuario.id, novasAreas);
    if (error) {
      showToast(error, "error");
      // desfaz em caso de erro
      setUsuarios((prev) =>
        prev.map((u) => (u.id === usuario.id ? { ...u, areasPermitidas: usuario.areasPermitidas } : u))
      );
    }
    setSavingId(null);
  };

  const alterarPolo = async (usuario: Usuario, poloId: string) => {
    const novoPoloId = poloId || null;

    if (usuario.role === "supervisor" && !novoPoloId) {
      showToast("Não é possível tirar o polo de um supervisor. Rebaixe para colaborador antes, se necessário.", "error");
      return;
    }

    const poloAnterior = usuario.poloId;
    const poloNome = polos.find((p) => p.id === novoPoloId)?.nome;
    // Setor de outro polo deixa de valer — limpa local e no banco.
    const setorFicaInvalido =
      !!usuario.setorId &&
      !!novoPoloId &&
      !setores.some((s) => s.id === usuario.setorId && s.poloId === novoPoloId);

    setUsuarios((prev) =>
      prev.map((u) =>
        u.id === usuario.id
          ? {
              ...u,
              poloId: novoPoloId ?? undefined,
              poloNome,
              ...(setorFicaInvalido || !novoPoloId
                ? { setorId: undefined, setorNome: undefined }
                : {}),
            }
          : u
      )
    );
    setSavingId(usuario.id);

    const { error } = await definirPoloUsuario(usuario.id, novoPoloId);
    if (error) {
      showToast(error, "error");
      setUsuarios((prev) =>
        prev.map((u) =>
          u.id === usuario.id
            ? {
                ...u,
                poloId: poloAnterior,
                poloNome: usuario.poloNome,
                setorId: usuario.setorId,
                setorNome: usuario.setorNome,
              }
            : u
        )
      );
    } else if (setorFicaInvalido || !novoPoloId) {
      if (usuario.setorId) {
        await definirSetorUsuario(usuario.id, null);
      }
    }
    setSavingId(null);
  };

  const alterarRole = async (usuario: Usuario, novoRole: UserRole) => {
    if (novoRole === "supervisor" && !usuario.poloId) {
      showToast("Defina o polo do usuário antes de torná-lo supervisor.", "error");
      return;
    }

    const roleAnterior = usuario.role;
    const setorAnterior = usuario.setorId;
    const setorNomeAnterior = usuario.setorNome;
    // Admin/supervisor não usam setor (regra do banco limpa no trigger).
    const limparSetor = novoRole === "admin" || novoRole === "supervisor";

    setUsuarios((prev) =>
      prev.map((u) =>
        u.id === usuario.id
          ? {
              ...u,
              role: novoRole,
              ...(limparSetor ? { setorId: undefined, setorNome: undefined } : {}),
            }
          : u
      )
    );
    setSavingId(usuario.id);

    const { error } = await definirRoleUsuario(usuario.id, novoRole, usuario.poloId ?? null);
    if (error) {
      showToast(error, "error");
      setUsuarios((prev) =>
        prev.map((u) =>
          u.id === usuario.id
            ? { ...u, role: roleAnterior, setorId: setorAnterior, setorNome: setorNomeAnterior }
            : u
        )
      );
    } else {
      if (limparSetor && setorAnterior) {
        await definirSetorUsuario(usuario.id, null);
      }
      showToast(`${usuario.name} agora é ${ROLE_LABELS[novoRole]}`, "success");
    }
    setSavingId(null);
  };

  const alterarSetor = async (usuario: Usuario, setorId: string) => {
    const novoSetorId = setorId || null;
    const temEngajamento = usuario.areasPermitidas.includes("engajamento");

    if (!novoSetorId && temEngajamento) {
      showToast(
        "Colaborador com área Engajamento precisa de um setor. Remova a área antes de limpar o setor.",
        "error"
      );
      return;
    }

    const setorAnterior = usuario.setorId;
    const setorNomeAnterior = usuario.setorNome;
    const setorNome = setores.find((s) => s.id === novoSetorId)?.nome;

    setUsuarios((prev) =>
      prev.map((u) =>
        u.id === usuario.id
          ? { ...u, setorId: novoSetorId ?? undefined, setorNome }
          : u
      )
    );
    setSavingId(usuario.id);

    const { error } = await definirSetorUsuario(usuario.id, novoSetorId);
    if (error) {
      showToast(error, "error");
      setUsuarios((prev) =>
        prev.map((u) =>
          u.id === usuario.id
            ? { ...u, setorId: setorAnterior, setorNome: setorNomeAnterior }
            : u
        )
      );
    }
    setSavingId(null);
  };

  if (isLoading) {
    return (
      <div className="usuarios-loading">
        <Loader2 size={32} className="spin" />
        <p>Carregando usuários...</p>
      </div>
    );
  }

  return (
    <div className="usuarios-page">
      <div className="usuarios-header">
        <div>
          <h1>Usuários</h1>
          <p className="usuarios-subtitle">
            Aprove novos cadastros e defina a quais áreas cada colaborador tem acesso
          </p>
        </div>
      </div>

      <div className="usuarios-toolbar">
        <div className="usuarios-busca">
          <Search size={16} />
          <input
            type="search"
            placeholder="Buscar por nome ou e-mail..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar usuários"
          />
        </div>
        <div className="usuarios-polo-chips" role="group" aria-label="Filtrar por polo">
          <button
            type="button"
            className={`usuarios-polo-chip${poloFiltro === null ? " active" : ""}`}
            onClick={() => setPoloFiltro(null)}
          >
            Todos
            <span className="usuarios-polo-chip-count">{contagemPorPolo.todos ?? 0}</span>
          </button>
          {polos.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`usuarios-polo-chip${poloFiltro === p.id ? " active" : ""}`}
              onClick={() => setPoloFiltro(p.id)}
            >
              <MapPin size={12} />
              {p.nome}
              <span className="usuarios-polo-chip-count">{contagemPorPolo[p.id] ?? 0}</span>
            </button>
          ))}
          <button
            type="button"
            className={`usuarios-polo-chip${poloFiltro === "__sem__" ? " active" : ""}`}
            onClick={() => setPoloFiltro("__sem__")}
          >
            Sem polo
            <span className="usuarios-polo-chip-count">{contagemPorPolo.__sem__ ?? 0}</span>
          </button>
        </div>
      </div>

      {pendentes.length > 0 && (
        <section className="usuarios-section">
          <h2 className="usuarios-section-title">
            <Clock size={17} />
            Aguardando aprovação ({pendentes.length})
          </h2>

          <div className="usuarios-list">
            {pendentes.map((usuario) => (
              <div key={usuario.id} className="usuario-card usuario-card-pendente">
                <div className="usuario-identity">
                  <div className="usuario-avatar">{usuario.name.charAt(0).toUpperCase()}</div>
                  <div>
                    <p className="usuario-name">{usuario.name}</p>
                    <p className="usuario-email">{usuario.email}</p>
                    <p className="usuario-meta">Cadastrado em {formatDate(usuario.createdAt)}</p>
                  </div>
                </div>

                <div className="usuario-actions">
                  <button
                    className="btn btn-success btn-sm"
                    disabled={savingId === usuario.id}
                    onClick={() => aprovar(usuario)}
                  >
                    <Check size={15} /> Aprovar
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    disabled={savingId === usuario.id}
                    onClick={() => recusar(usuario)}
                  >
                    <X size={15} /> Recusar
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={savingId === usuario.id}
                    onClick={() => apagar(usuario)}
                    title="Apagar usuário permanentemente"
                  >
                    <Trash2 size={15} /> Apagar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="usuarios-section">
        <h2 className="usuarios-section-title">
          <UserCog size={17} />
          Usuários por polo
          <span className="usuarios-section-count">({demais.length})</span>
        </h2>

        {gruposPorPolo.length === 0 ? (
          <p className="usuarios-vazio">Nenhum usuário encontrado com os filtros atuais.</p>
        ) : (
          <div className="usuarios-polos-grid">
            {gruposPorPolo.map((grupo) => (
              <div key={grupo.poloId || "__sem__"} className="usuarios-polo-card">
                <div className="usuarios-polo-card-header">
                  <div className="usuarios-polo-card-title">
                    <MapPin size={16} />
                    <h3>{grupo.nome}</h3>
                  </div>
                  <span className="usuarios-polo-card-count">
                    {grupo.usuarios.length}{" "}
                    {grupo.usuarios.length === 1 ? "usuário" : "usuários"}
                  </span>
                </div>
                <div className="usuarios-list">
                  {grupo.usuarios.map((usuario) => {
            const statusInfo = STATUS_INFO[usuario.status];
            const isSelfAdmin = usuario.role === "admin";

            return (
              <div key={usuario.id} className="usuario-card">
                <div className="usuario-identity">
                  <div className="usuario-avatar">{usuario.name.charAt(0).toUpperCase()}</div>
                  <div>
                    <p className="usuario-name">
                      {usuario.name}
                      {isSelfAdmin && (
                        <span className="usuario-admin-badge">
                          <ShieldCheck size={12} /> Admin
                        </span>
                      )}
                    </p>
                    <p className="usuario-email">{usuario.email}</p>
                  </div>
                </div>

                <div className="usuario-status-col">
                  <span className={`status-chip ${statusInfo.className}`}>{statusInfo.label}</span>

                  {!isSelfAdmin && usuario.status === "aprovado" && (
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={savingId === usuario.id}
                      onClick={() => revogarAcesso(usuario)}
                    >
                      <UserX size={14} /> Revogar acesso
                    </button>
                  )}

                  {!isSelfAdmin && usuario.status === "rejeitado" && (
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={savingId === usuario.id}
                      onClick={() => reativar(usuario)}
                    >
                      <Check size={14} /> Reativar
                    </button>
                  )}

                  {!isSelfAdmin && (
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={savingId === usuario.id}
                      onClick={() => apagar(usuario)}
                      title="Apagar usuário permanentemente"
                    >
                      <Trash2 size={14} /> Apagar
                    </button>
                  )}
                </div>

                {!isSelfAdmin ? (
                  <>
                    <div className="usuario-polo">
                      <label htmlFor={`role-${usuario.id}`}>Nível de acesso</label>
                      <select
                        id={`role-${usuario.id}`}
                        value={usuario.role}
                        disabled={savingId === usuario.id || usuario.status !== "aprovado"}
                        onChange={(e) => alterarRole(usuario, e.target.value as UserRole)}
                      >
                        <option value="colaborador">{ROLE_LABELS.colaborador}</option>
                        <option value="supervisor">{ROLE_LABELS.supervisor}</option>
                      </select>
                      {usuario.role === "supervisor" && !usuario.poloId && (
                        <p className="usuario-role-aviso">
                          Defina um polo abaixo — supervisor sem polo não consegue acessar o sistema corretamente.
                        </p>
                      )}
                    </div>
                    <div className="usuario-areas">
                      {TODAS_AREAS.map((area) => {
                        const ativo = usuario.areasPermitidas.includes(area);
                        const limiteAtingido =
                          !ativo && usuario.areasPermitidas.length >= MAX_AREAS_POR_COLABORADOR;
                        return (
                          <label
                            key={area}
                            className={`area-toggle ${ativo ? "active" : ""} ${limiteAtingido ? "disabled" : ""}`}
                            title={limiteAtingido ? `Limite de ${MAX_AREAS_POR_COLABORADOR} áreas atingido` : undefined}
                          >
                            <input
                              type="checkbox"
                              checked={ativo}
                              disabled={savingId === usuario.id || usuario.status !== "aprovado" || limiteAtingido}
                              onChange={() => toggleArea(usuario, area)}
                            />
                            {AREA_CONFIG[area].label}
                          </label>
                        );
                      })}
                    </div>
                    <div className="usuario-polo">
                      <label htmlFor={`polo-${usuario.id}`}>Polo</label>
                      <select
                        id={`polo-${usuario.id}`}
                        value={usuario.poloId || ""}
                        disabled={savingId === usuario.id || usuario.status !== "aprovado"}
                        onChange={(e) => alterarPolo(usuario, e.target.value)}
                      >
                        <option value="">Selecione um polo...</option>
                        {polos.map((polo) => (
                          <option key={polo.id} value={polo.id}>
                            {polo.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                    {usuario.role === "colaborador" && (
                      <div className="usuario-polo">
                        <label htmlFor={`setor-${usuario.id}`}>
                          Setor (Engajamento)
                          {usuario.areasPermitidas.includes("engajamento") && (
                            <span className="required"> *</span>
                          )}
                        </label>
                        <select
                          id={`setor-${usuario.id}`}
                          value={usuario.setorId || ""}
                          disabled={
                            savingId === usuario.id || usuario.status !== "aprovado"
                          }
                          onChange={(e) => alterarSetor(usuario, e.target.value)}
                        >
                          <option value="">Selecione um setor...</option>
                          {setores
                            .filter((s) =>
                              usuario.poloId ? s.poloId === usuario.poloId : true
                            )
                            .map((setor) => (
                              <option key={setor.id} value={setor.id}>
                                {setor.nome}
                              </option>
                            ))}
                        </select>
                        {usuario.areasPermitidas.includes("engajamento") &&
                          !usuario.setorId && (
                          <p className="usuario-polo-aviso">
                            Obrigatório para área Engajamento — defina o setor
                            antes de liberar a área.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="usuario-areas-admin-note">Acesso total (admin)</p>
                )}
              </div>
            );

                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Usuarios;