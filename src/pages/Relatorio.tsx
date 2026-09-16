import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  Filter,
  PlusCircle,
  ArrowRightLeft,
  GitBranch,
  RefreshCw,
  Download,
  Radio,
  X,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useAlunos } from "../hooks/useAlunos";
import { useToast } from "../hooks/useToast";
import {
  listarAuditoriaEventos,
  subscribeAuditoriaEventos,
  exportarAuditoriaEventos,
} from "../services/auditoriaService";
import {
  Area,
  AuditoriaEvento,
  AuditoriaEventoTipo,
  AuditoriaFiltros,
} from "../types";
import { formatDateTime, getStatusLabel } from "../utils/formatters";
import "./Relatorio.css";

const PAGE_SIZE = 50;

const AREA_LABEL: Record<Area, string> = {
  rematricula: "Rematrícula",
  engajamento: "Engajamento",
  retencao: "Retenção",
};

const TIPO_LABEL: Record<AuditoriaEventoTipo, string> = {
  criacao: "Criação",
  status: "Status",
  transferencia: "Transferência",
};

type NomeResolver = {
  setorNome: (id?: string | null) => string | undefined;
  pessoaNome: (id?: string | null) => string | undefined;
};

function detalheEvento(ev: AuditoriaEvento, resolver?: NomeResolver): string {
  const p = ev.payload || {};
  if (ev.tipo === "criacao") {
    const status = p.status_inicial
      ? getStatusLabel(String(p.status_inicial))
      : "—";
    const ra = p.ra ? ` · RA ${p.ra}` : "";
    return `Status inicial: ${status}${ra}`;
  }
  if (ev.tipo === "status") {
    const de = p.status_de ? getStatusLabel(String(p.status_de)) : "?";
    const para = p.status_para ? getStatusLabel(String(p.status_para)) : "?";
    return `${de} → ${para}`;
  }
  if (ev.tipo === "transferencia") {
    const partes: string[] = [];
    if (p.tipo_solicitacao === "assumir_responsabilidade") {
      partes.push("Assumir responsabilidade");
    } else if (p.tipo_solicitacao === "mudanca_setor") {
      partes.push("Mudança de setor");
    } else {
      partes.push("Transferência");
    }

    const setorDe =
      (p.setor_origem_nome as string) ||
      resolver?.setorNome(p.setor_origem_id as string) ||
      null;
    const setorPara =
      (p.setor_destino_nome as string) ||
      resolver?.setorNome(p.setor_destino_id as string) ||
      null;
    if (setorDe || setorPara) {
      partes.push(`Setor: ${setorDe ?? "—"} → ${setorPara ?? "—"}`);
    }

    const respDe =
      (p.responsavel_origem_nome as string) ||
      resolver?.pessoaNome(p.responsavel_origem_id as string) ||
      null;
    const respPara =
      (p.colaborador_destino_nome as string) ||
      resolver?.pessoaNome(p.colaborador_destino_id as string) ||
      null;
    if (respDe || respPara) {
      partes.push(`Resp.: ${respDe ?? "—"} → ${respPara ?? "—"}`);
    }

    const solicitante =
      (p.solicitante_nome as string) ||
      resolver?.pessoaNome(p.solicitante_id as string);
    if (solicitante) partes.push(`Solicitante: ${solicitante}`);

    if (p.motivo) partes.push(String(p.motivo).slice(0, 80));

    return partes.join(" · ");
  }
  return "—";
}

/**
 * Relatório global de auditoria (somente admin e supervisor).
 * Eventos: criação, mudança de status, transferência aprovada.
 * Filtros locais (funil, tipo, período, colaborador, busca).
 * Tempo real + exportação XLSX.
 */
const Relatorio: React.FC = () => {
  const { user } = useAuth();
  const { colaboradores, setores } = useAlunos();
  const { showToast } = useToast();

  const [eventos, setEventos] = useState<AuditoriaEvento[]>([]);
  const [loading, setLoading] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [temMais, setTemMais] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [livePulse, setLivePulse] = useState(false);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [eventoSelecionado, setEventoSelecionado] = useState<AuditoriaEvento | null>(null);

  const [filtros, setFiltros] = useState<AuditoriaFiltros>({
    tipo: "",
    area: "",
    actorId: "",
    search: "",
    dateFrom: "",
    dateTo: "",
  });
  const [aplicados, setAplicados] = useState<AuditoriaFiltros>({
    tipo: "",
    area: "",
    actorId: "",
    search: "",
    dateFrom: "",
    dateTo: "",
  });

  const resolver = useMemo<NomeResolver>(
    () => ({
      setorNome: (id) =>
        id ? setores.find((s) => s.id === id)?.nome : undefined,
      pessoaNome: (id) =>
        id ? colaboradores.find((c) => c.id === id)?.name : undefined,
    }),
    [setores, colaboradores]
  );

  const carregar = useCallback(
    async (offset = 0, append = false) => {
      if (offset === 0) setLoading(true);
      else setCarregandoMais(true);

      const { eventos: lista, error } = await listarAuditoriaEventos({
        filtros: {
          ...aplicados,
          // Sempre o polo do usuário logado — não há filtro de polo na UI.
          poloId: user?.poloId || undefined,
        },
        limit: PAGE_SIZE,
        offset,
      });

      if (error) {
        showToast(error, "error");
        if (!append) setEventos([]);
      } else {
        setEventos((prev) => (append ? [...prev, ...lista] : lista));
        setTemMais(lista.length >= PAGE_SIZE);
      }

      setLoading(false);
      setCarregandoMais(false);
    },
    [aplicados, showToast, user?.poloId]
  );

  useEffect(() => {
    carregar(0, false);
  }, [carregar]);

  useEffect(() => {
    const unsub = subscribeAuditoriaEventos((novo) => {
      setEventos((prev) => {
        if (prev.some((e) => e.id === novo.id)) return prev;

        if (aplicados.tipo && novo.tipo !== aplicados.tipo) return prev;
        if (aplicados.area && novo.area !== aplicados.area) return prev;
        if (aplicados.actorId && novo.actorId !== aplicados.actorId) return prev;
        // Isolado ao polo do usuário logado
        if (user?.poloId && novo.poloId && novo.poloId !== user.poloId) return prev;
        if (aplicados.search?.trim()) {
          const t = aplicados.search.trim().toLowerCase();
          if (!(novo.alunoNome || "").toLowerCase().includes(t)) return prev;
        }
        if (aplicados.dateFrom) {
          if (novo.createdAt < `${aplicados.dateFrom}T00:00:00`) return prev;
        }
        if (aplicados.dateTo) {
          if (novo.createdAt > `${aplicados.dateTo}T23:59:59.999`) return prev;
        }

        return [novo, ...prev];
      });

      setLivePulse(true);
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
      liveTimerRef.current = setTimeout(() => setLivePulse(false), 4000);
    });
    return () => {
      unsub();
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    };
  }, [aplicados, user?.poloId]);

  const handleAplicarFiltros = () => {
    setAplicados({ ...filtros });
  };

  const handleLimparFiltros = () => {
    const vazios: AuditoriaFiltros = {
      tipo: "",
      area: "",
      actorId: "",
      search: "",
      dateFrom: "",
      dateTo: "",
    };
    setFiltros(vazios);
    setAplicados(vazios);
  };

  const handleExportar = async () => {
    setExportando(true);
    const { count, error } = await exportarAuditoriaEventos({
      ...aplicados,
      poloId: user?.poloId || undefined,
    });
    setExportando(false);
    if (error) showToast(error, "error");
    else showToast(`${count} evento(s) exportado(s).`, "success");
  };

  const filtrosAtivos = useMemo(() => {
    let n = 0;
    if (aplicados.tipo) n++;
    if (aplicados.area) n++;
    if (aplicados.actorId) n++;
    if (aplicados.search?.trim()) n++;
    if (aplicados.dateFrom) n++;
    if (aplicados.dateTo) n++;
    return n;
  }, [aplicados]);

  return (
    <div className="relatorio-page">
      <div className="relatorio-header">
        <div>
          <h1>
            <ClipboardList
              size={22}
              style={{ verticalAlign: "text-bottom", marginRight: 8 }}
            />
            Relatório
            <span
              className={`relatorio-live-badge ${livePulse ? "pulse" : ""}`}
              title="Atualização em tempo real"
            >
              <Radio size={12} />
              Ao vivo
            </span>
          </h1>
          <p className="relatorio-subtitle">
            Histórico de criações, mudanças de status e transferências do seu polo
          </p>
        </div>
        <div className="relatorio-header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportar}
            disabled={exportando || loading}
            title="Exportar XLSX com os filtros aplicados"
          >
            <Download size={16} />
            {exportando ? "Exportando..." : "Exportar"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => carregar(0, false)}
            title="Atualizar"
          >
            <RefreshCw size={16} />
            Atualizar
          </button>
        </div>
      </div>

      <div className="relatorio-toolbar">
        <input
          type="search"
          className="relatorio-search"
          placeholder="Buscar por nome do aluno..."
          value={filtros.search || ""}
          onChange={(e) =>
            setFiltros((f) => ({ ...f, search: e.target.value }))
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAplicarFiltros();
          }}
        />
        <button
          type="button"
          className={`btn btn-secondary ${showFilters ? "active" : ""}`}
          onClick={() => setShowFilters((v) => !v)}
        >
          <Filter size={16} />
          Filtros
          {filtrosAtivos > 0 && (
            <span className="relatorio-filter-badge">{filtrosAtivos}</span>
          )}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleAplicarFiltros}
        >
          Aplicar
        </button>
      </div>

      {showFilters && (
        <div className="relatorio-filters">
          <div className="relatorio-filter-group">
            <label>Tipo</label>
            <select
              value={filtros.tipo || ""}
              onChange={(e) =>
                setFiltros((f) => ({
                  ...f,
                  tipo: e.target.value as AuditoriaEventoTipo | "",
                }))
              }
            >
              <option value="">Todos</option>
              <option value="criacao">Criação</option>
              <option value="status">Status</option>
              <option value="transferencia">Transferência</option>
            </select>
          </div>

          <div className="relatorio-filter-group">
            <label>Funil</label>
            <select
              value={filtros.area || ""}
              onChange={(e) =>
                setFiltros((f) => ({
                  ...f,
                  area: e.target.value as Area | "",
                }))
              }
            >
              <option value="">Todos</option>
              <option value="rematricula">Rematrícula</option>
              <option value="engajamento">Engajamento</option>
              <option value="retencao">Retenção</option>
            </select>
          </div>

          <div className="relatorio-filter-group">
            <label>Usuário</label>
            <select
              value={filtros.actorId || ""}
              onChange={(e) =>
                setFiltros((f) => ({ ...f, actorId: e.target.value }))
              }
            >
              <option value="">Todos</option>
              {colaboradores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="relatorio-filter-group">
            <label>De</label>
            <input
              type="date"
              value={filtros.dateFrom || ""}
              onChange={(e) =>
                setFiltros((f) => ({ ...f, dateFrom: e.target.value }))
              }
            />
          </div>

          <div className="relatorio-filter-group">
            <label>Até</label>
            <input
              type="date"
              value={filtros.dateTo || ""}
              onChange={(e) =>
                setFiltros((f) => ({ ...f, dateTo: e.target.value }))
              }
            />
          </div>

          <div className="relatorio-filter-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleLimparFiltros}
            >
              Limpar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="relatorio-loading">Carregando eventos...</p>
      ) : eventos.length === 0 ? (
        <div className="relatorio-empty">
          <p>Nenhum evento encontrado com os filtros atuais.</p>
          <p className="relatorio-empty-hint">
            Mudanças de status passam a ser registradas a partir da ativação
            desta funcionalidade. Criações e transferências aprovadas antigas
            entram no backfill da migration.
          </p>
        </div>
      ) : (
        <>
          <div className="relatorio-table-wrap">
            <table className="relatorio-table">
              <thead>
                <tr>
                  <th>Data / hora</th>
                  <th>Tipo</th>
                  <th>Aluno</th>
                  <th>Funil</th>
                  <th>Detalhe</th>
                  <th>Usuário</th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((ev) => (
                  <tr
                    key={ev.id}
                    className={`relatorio-row ${eventoSelecionado?.id === ev.id ? "selected" : ""}`}
                    onClick={() => setEventoSelecionado(ev)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setEventoSelecionado(ev);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    title="Ver detalhes"
                  >
                    <td className="relatorio-td-data">
                      {formatDateTime(ev.createdAt)}
                    </td>
                    <td>
                      <span
                        className={`relatorio-tipo relatorio-tipo-${ev.tipo}`}
                      >
                        {ev.tipo === "criacao" && <PlusCircle size={14} />}
                        {ev.tipo === "status" && <GitBranch size={14} />}
                        {ev.tipo === "transferencia" && (
                          <ArrowRightLeft size={14} />
                        )}
                        {TIPO_LABEL[ev.tipo]}
                      </span>
                    </td>
                    <td className="relatorio-td-aluno">
                      {ev.alunoNome || "—"}
                    </td>
                    <td>{ev.area ? AREA_LABEL[ev.area] || ev.area : "—"}</td>
                    <td className="relatorio-td-detalhe">
                      {detalheEvento(ev, resolver)}
                    </td>
                    <td>{ev.actorNome || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {temMais && (
            <div className="relatorio-load-more">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={carregandoMais}
                onClick={() => carregar(eventos.length, true)}
              >
                {carregandoMais ? "Carregando..." : "Carregar mais"}
              </button>
            </div>
          )}
        </>
      )}

      {eventoSelecionado && (
        <div
          className="relatorio-detail-overlay"
          onClick={() => setEventoSelecionado(null)}
          role="presentation"
        >
          <div
            className="relatorio-detail-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="relatorio-detail-title"
          >
            <div className="relatorio-detail-header">
              <h2 id="relatorio-detail-title">
                <span
                  className={`relatorio-tipo relatorio-tipo-${eventoSelecionado.tipo}`}
                >
                  {eventoSelecionado.tipo === "criacao" && (
                    <PlusCircle size={14} />
                  )}
                  {eventoSelecionado.tipo === "status" && (
                    <GitBranch size={14} />
                  )}
                  {eventoSelecionado.tipo === "transferencia" && (
                    <ArrowRightLeft size={14} />
                  )}
                  {TIPO_LABEL[eventoSelecionado.tipo]}
                </span>
                Detalhes do evento
              </h2>
              <button
                type="button"
                className="relatorio-detail-close"
                onClick={() => setEventoSelecionado(null)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <dl className="relatorio-detail-grid">
              <div>
                <dt>Data / hora</dt>
                <dd>{formatDateTime(eventoSelecionado.createdAt)}</dd>
              </div>
              <div>
                <dt>Aluno</dt>
                <dd>{eventoSelecionado.alunoNome || "—"}</dd>
              </div>
              <div>
                <dt>Funil</dt>
                <dd>
                  {eventoSelecionado.area
                    ? AREA_LABEL[eventoSelecionado.area] ||
                      eventoSelecionado.area
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Autorização</dt>
                <dd>{eventoSelecionado.actorNome || "—"}</dd>
              </div>
              <div className="relatorio-detail-full">
                <dt>Resumo</dt>
                <dd>{detalheEvento(eventoSelecionado, resolver)}</dd>
              </div>
            </dl>

            {eventoSelecionado.tipo === "criacao" && (
              <div className="relatorio-detail-section">
                <h3>Criação do registro</h3>
                <ul className="relatorio-detail-list">
                  <li>
                    <span>Status inicial</span>
                    <strong>
                      {eventoSelecionado.payload?.status_inicial
                        ? getStatusLabel(
                            String(eventoSelecionado.payload.status_inicial)
                          )
                        : "—"}
                    </strong>
                  </li>
                  {!!eventoSelecionado.payload?.ra && (
                    <li>
                      <span>RA</span>
                      <strong>{String(eventoSelecionado.payload.ra)}</strong>
                    </li>
                  )}
                  {!!eventoSelecionado.payload?.curso && (
                    <li>
                      <span>Curso</span>
                      <strong>{String(eventoSelecionado.payload.curso)}</strong>
                    </li>
                  )}
                  {!!eventoSelecionado.payload?.canal && (
                    <li>
                      <span>Canal</span>
                      <strong>{String(eventoSelecionado.payload.canal)}</strong>
                    </li>
                  )}
                </ul>
              </div>
            )}

            {eventoSelecionado.tipo === "status" && (
              <div className="relatorio-detail-section">
                <h3>Movimentação de status</h3>
                <div className="relatorio-detail-status-flow">
                  <span className="relatorio-detail-status-pill">
                    {eventoSelecionado.payload?.status_de
                      ? getStatusLabel(
                          String(eventoSelecionado.payload.status_de)
                        )
                      : "?"}
                  </span>
                  <span className="relatorio-detail-arrow">→</span>
                  <span className="relatorio-detail-status-pill para">
                    {eventoSelecionado.payload?.status_para
                      ? getStatusLabel(
                          String(eventoSelecionado.payload.status_para)
                        )
                      : "?"}
                  </span>
                </div>
              </div>
            )}

            {eventoSelecionado.tipo === "transferencia" && (
              <div className="relatorio-detail-section">
                <h3>Transferência</h3>
                <ul className="relatorio-detail-list">
                  <li>
                    <span>Tipo</span>
                    <strong>
                      {eventoSelecionado.payload?.tipo_solicitacao ===
                      "assumir_responsabilidade"
                        ? "Assumir responsabilidade"
                        : eventoSelecionado.payload?.tipo_solicitacao ===
                          "mudanca_setor"
                        ? "Mudança de setor"
                        : "Transferência"}
                    </strong>
                  </li>
                  <li>
                    <span>Setor</span>
                    <strong>
                      {(eventoSelecionado.payload?.setor_origem_nome as
                        string) ||
                        resolver.setorNome(
                          eventoSelecionado.payload?.setor_origem_id as string
                        ) ||
                        "—"}{" "}
                      →{" "}
                      {(eventoSelecionado.payload?.setor_destino_nome as
                        string) ||
                        resolver.setorNome(
                          eventoSelecionado.payload?.setor_destino_id as string
                        ) ||
                        "—"}
                    </strong>
                  </li>
                  <li>
                    <span>Responsável</span>
                    <strong>
                      {(eventoSelecionado.payload
                        ?.responsavel_origem_nome as string) ||
                        resolver.pessoaNome(
                          eventoSelecionado.payload
                            ?.responsavel_origem_id as string
                        ) ||
                        "—"}{" "}
                      →{" "}
                      {(eventoSelecionado.payload
                        ?.colaborador_destino_nome as string) ||
                        resolver.pessoaNome(
                          eventoSelecionado.payload
                            ?.colaborador_destino_id as string
                        ) ||
                        "—"}
                    </strong>
                  </li>
                  <li>
                    <span>Solicitante</span>
                    <strong>
                      {(eventoSelecionado.payload?.solicitante_nome as
                        string) ||
                        resolver.pessoaNome(
                          eventoSelecionado.payload?.solicitante_id as string
                        ) ||
                        "—"}
                    </strong>
                  </li>
                  {!!eventoSelecionado.payload?.motivo && (
                    <li>
                      <span>Motivo</span>
                      <strong>
                        {String(eventoSelecionado.payload.motivo)}
                      </strong>
                    </li>
                  )}
                  {!!eventoSelecionado.payload?.observacao_decisao && (
                    <li>
                      <span>Obs. da decisão</span>
                      <strong>
                        {String(eventoSelecionado.payload.observacao_decisao)}
                      </strong>
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="relatorio-detail-footer">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setEventoSelecionado(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Relatorio;
