import React, { useEffect, useMemo, useState } from "react";
import { getUsuarios, definirStatusUsuario, definirAreasUsuario, definirPoloUsuario, definirRoleUsuario } from "../services/usuariosService";
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
  const { polos } = useAlunos();

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

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

  const pendentes = useMemo(() => usuarios.filter((u) => u.status === "pendente"), [usuarios]);
  const demais = useMemo(() => usuarios.filter((u) => u.status !== "pendente"), [usuarios]);

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

  const toggleArea = async (usuario: Usuario, area: Area) => {
    const jaTem = usuario.areasPermitidas.includes(area);

    if (!jaTem && usuario.areasPermitidas.length >= MAX_AREAS_POR_COLABORADOR) {
      showToast(
        `Cada colaborador pode ter no máximo ${MAX_AREAS_POR_COLABORADOR} áreas liberadas ao mesmo tempo. Desmarque uma antes de marcar outra.`,
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

    setUsuarios((prev) =>
      prev.map((u) =>
        u.id === usuario.id ? { ...u, poloId: novoPoloId ?? undefined, poloNome } : u
      )
    );
    setSavingId(usuario.id);

    const { error } = await definirPoloUsuario(usuario.id, novoPoloId);
    if (error) {
      showToast(error, "error");
      setUsuarios((prev) =>
        prev.map((u) =>
          u.id === usuario.id
            ? { ...u, poloId: poloAnterior, poloNome: usuario.poloNome }
            : u
        )
      );
    }
    setSavingId(null);
  };

  const alterarRole = async (usuario: Usuario, novoRole: UserRole) => {
    if (novoRole === "supervisor" && !usuario.poloId) {
      showToast("Defina o polo do usuário antes de torná-lo supervisor.", "error");
      return;
    }

    const roleAnterior = usuario.role;
    setUsuarios((prev) => prev.map((u) => (u.id === usuario.id ? { ...u, role: novoRole } : u)));
    setSavingId(usuario.id);

    const { error } = await definirRoleUsuario(usuario.id, novoRole, usuario.poloId ?? null);
    if (error) {
      showToast(error, "error");
      setUsuarios((prev) => prev.map((u) => (u.id === usuario.id ? { ...u, role: roleAnterior } : u)));
    } else {
      showToast(`${usuario.name} agora é ${ROLE_LABELS[novoRole]}`, "success");
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
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="usuarios-section">
        <h2 className="usuarios-section-title">
          <UserCog size={17} />
          Todos os usuários
        </h2>

        <div className="usuarios-list">
          {demais.map((usuario) => {
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
                  </>
                ) : (
                  <p className="usuario-areas-admin-note">Acesso total (admin)</p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default Usuarios;