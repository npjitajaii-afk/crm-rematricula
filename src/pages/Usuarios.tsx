import React, { useEffect, useMemo, useState } from "react";
import { Usuario, Area } from "../types";
import { getUsuarios, definirStatusUsuario, definirAreasUsuario } from "../services/usuariosService";
import { AREA_CONFIG } from "../config/areas";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
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

const STATUS_INFO: Record<Usuario["status"], { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "status-chip-pendente" },
  aprovado: { label: "Aprovado", className: "status-chip-aprovado" },
  rejeitado: { label: "Recusado", className: "status-chip-rejeitado" },
};

const Usuarios: React.FC = () => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();

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
