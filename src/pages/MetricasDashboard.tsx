import React, { useEffect, useState } from "react";
import {
  Users,
  TrendingUp,
  Wallet,
  MessageSquare,
  AlertTriangle,
  Clock,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import {
  getMetricasGerais,
  getMetricasColaboradores,
  getMetricasCanais,
  getMetricasCanaisCruzado,
  getPipelineResumo,
  getOverviewGeral,
} from "../services/metricasService";
import {
  Area,
  MetricasGerais,
  MetricaColaborador,
  MetricaCanal,
  MetricasOverviewGeral,
  PipelineStatusResumo,
} from "../types";
import { AREA_CONFIG } from "../config/areas";
import { formatCurrency, getStatusColor, getStatusLabel, getSourceLabel } from "../utils/formatters";
import "./MetricasDashboard.css";

const PROCESSOS: Area[] = ["rematricula", "retencao", "engajamento"];

// Rótulos de KPI variam por área — cada funil tem seu próprio conceito de
// "sucesso" e nem todo funil tem componente financeiro (ver README, seção
// de métricas). Engajamento não tem valor monetário associado, então o 3º
// card mostra interações do dia no lugar de valor recuperado.
const AREA_LABELS: Record<
  Area,
  { total: string; sucesso: string; terceiro: string; tempo: string; temValor: boolean }
> = {
  rematricula: {
    total: "Total na carteira",
    sucesso: "Rematriculados",
    terceiro: "Valor recuperado",
    tempo: "Tempo médio até rematricular",
    temValor: true,
  },
  retencao: {
    total: "Total recebido",
    sucesso: "Recuperados",
    terceiro: "Valor recuperado",
    tempo: "Tempo médio até decisão",
    temValor: true,
  },
  engajamento: {
    total: "Total acompanhado",
    sucesso: "Engajados",
    terceiro: "Interações hoje",
    tempo: "Tempo médio até engajar",
    temValor: false,
  },
};

const MetricasDashboard: React.FC = () => {
  const [processoAtivo, setProcessoAtivo] = useState<Area>("rematricula");

  return (
    <div className="metricas">
      <div className="metricas-header">
        <div>
          <h1>Métricas</h1>
          <p className="metricas-subtitle">Visão consolidada por processo</p>
        </div>
      </div>

      <OverviewGeral />

      <div className="metricas-processo-selector" role="tablist" aria-label="Processo">
        {PROCESSOS.map((area) => (
          <button
            key={area}
            type="button"
            role="tab"
            aria-selected={processoAtivo === area}
            className={`metricas-processo-tab ${processoAtivo === area ? "active" : ""}`}
            onClick={() => setProcessoAtivo(area)}
          >
            {AREA_CONFIG[area].label}
          </button>
        ))}
      </div>

      <AreaDashboard area={processoAtivo} />

      <MetricasCruzadas />
    </div>
  );
};

export default MetricasDashboard;

// =====================================================================
// Cabeçalho geral fixo — total do sistema, quebra por área e alertas.
// Não muda com a aba selecionada: é a visão da operação inteira.
// =====================================================================
const OverviewGeral: React.FC = () => {
  const { showToast } = useToast();
  const [overview, setOverview] = useState<MetricasOverviewGeral | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    getOverviewGeral().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) showToast("Erro ao carregar visão geral", "error");
      else setOverview(data);
      setIsLoading(false);
    });
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return <div className="metricas-overview metricas-loading">Carregando visão geral...</div>;
  }

  return (
    <div className="metricas-overview">
      <span className="metricas-overview-title">Visão geral da operação</span>
      <div className="metricas-overview-stats">
        <div className="metricas-overview-stat">
          <span className="metricas-overview-label">Total no sistema</span>
          <span className="metricas-overview-value">{overview?.totalGeral ?? 0}</span>
        </div>
        {PROCESSOS.map((area) => (
          <div className="metricas-overview-stat" key={area}>
            <span className="metricas-overview-label">{AREA_CONFIG[area].label}</span>
            <span className={`metricas-overview-value metricas-overview-value-${area}`}>
              {overview?.porArea[area] ?? 0}
            </span>
          </div>
        ))}
      </div>
      {(overview?.totalAlertas ?? 0) > 0 && (
        <div className="metricas-alert-pill">
          <AlertTriangle size={14} />
          {overview?.totalAlertas} {overview?.totalAlertas === 1 ? "alerta crítico" : "alertas críticos"} na operação
          <span className="metricas-alert-pill-hint">(parados há mais de 14 dias)</span>
        </div>
      )}
    </div>
  );
};

// =====================================================================
// Dashboard de uma área — KPIs, funil de pipeline, ranking de
// colaboradores (admin) e conversão por canal. Funciona igual para as
// 3 áreas, só troca os rótulos e o conceito de "sucesso" por trás.
// =====================================================================
interface AreaDashboardProps {
  area: Area;
}

const AreaDashboard: React.FC<AreaDashboardProps> = ({ area }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isSupervisor = user?.role === "supervisor";
  // Admin e supervisor veem o ranking de colaboradores (cada um filtrado pelo banco ao seu polo)
  const canVerRanking = isAdmin || isSupervisor;
  const { showToast } = useToast();
  const labels = AREA_LABELS[area];

  const [gerais, setGerais] = useState<MetricasGerais | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStatusResumo[]>([]);
  const [colaboradores, setColaboradores] = useState<MetricaColaborador[]>([]);
  const [canais, setCanais] = useState<MetricaCanal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setIsLoading(true);

      const [geraisRes, pipelineRes, canaisRes, colaboradoresRes] = await Promise.all([
        getMetricasGerais(area),
        getPipelineResumo(area),
        getMetricasCanais(area),
        canVerRanking ? getMetricasColaboradores(area) : Promise.resolve(null),
      ]);

      if (!isMounted) return;

      if (geraisRes.error) showToast("Erro ao carregar métricas gerais", "error");
      else setGerais(geraisRes.data);

      if (pipelineRes.error) showToast("Erro ao carregar pipeline", "error");
      else setPipeline(pipelineRes.data);

      if (canaisRes.error) showToast("Erro ao carregar métricas por canal", "error");
      else setCanais(canaisRes.data);

      if (colaboradoresRes) {
        if (colaboradoresRes.error) showToast("Erro ao carregar ranking de colaboradores", "error");
        else setColaboradores(colaboradoresRes.data);
      } else {
        setColaboradores([]);
      }

      setIsLoading(false);
    };

    load();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, canVerRanking]);

  if (isLoading && !gerais) {
    return <div className="metricas-loading">Carregando métricas...</div>;
  }

  const statusOrdenados = AREA_CONFIG[area].statuses
    .map((status) => pipeline.find((p) => p.status === status) ?? { status, total: 0, totalValorPendente: 0 })
    .filter((p) => p.total > 0 || AREA_CONFIG[area].statuses.includes(p.status));

  const chartData = statusOrdenados.map((p) => ({
    status: p.status,
    label: getStatusLabel(p.status),
    total: p.total,
    color: getStatusColor(p.status),
  }));

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon kpi-icon-primary">
            <Users size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">{labels.total}</span>
            <span className="kpi-value">{gerais?.totalAlunos ?? 0}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon kpi-icon-success">
            <TrendingUp size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">{labels.sucesso}</span>
            <span className="kpi-value">
              {gerais?.sucesso ?? 0}
              <span className="kpi-value-suffix">({gerais?.taxaConversao ?? 0}%)</span>
            </span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon kpi-icon-secondary">
            {labels.temValor ? <Wallet size={20} /> : <MessageSquare size={20} />}
          </div>
          <div className="kpi-content">
            <span className="kpi-label">{labels.terceiro}</span>
            <span className="kpi-value">
              {labels.temValor ? formatCurrency(gerais?.valorPrincipal ?? 0) : gerais?.interacoesHoje ?? 0}
            </span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon kpi-icon-primary">
            <Clock size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">{labels.tempo}</span>
            <span className="kpi-value">
              {gerais?.tempoMedioCicloDias !== null && gerais?.tempoMedioCicloDias !== undefined
                ? `${gerais.tempoMedioCicloDias} dias`
                : "—"}
            </span>
          </div>
        </div>

        {canVerRanking && (gerais?.alunosSemResponsavel ?? 0) > 0 && (
          <div className="kpi-card kpi-card-alert">
            <div className="kpi-icon kpi-icon-warning">
              <AlertTriangle size={20} />
            </div>
            <div className="kpi-content">
              <span className="kpi-label">Sem responsável</span>
              <span className="kpi-value">{gerais?.alunosSemResponsavel}</span>
            </div>
          </div>
        )}
      </div>

      <div className="metricas-section">
        <h2>Pipeline por status</h2>
        {chartData.length === 0 ? (
          <p className="metricas-empty">Nenhum dado disponível ainda.</p>
        ) : (
          <div className="metricas-chart-wrapper" style={{ height: Math.max(chartData.length * 40, 160) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--gray-200)" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => [Number(value), "Alunos"]}
                  contentStyle={{ fontSize: 13, borderRadius: 8 }}
                />
                <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={18}>
                  {chartData.map((entry) => (
                    <Cell key={entry.status} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {canVerRanking && (
        <div className="metricas-section">
          <h2>Ranking de colaboradores</h2>
          {colaboradores.length === 0 ? (
            <p className="metricas-empty">Nenhum colaborador com carteira ainda.</p>
          ) : (
            <div className="metricas-table-wrapper">
              <table className="metricas-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Carteira</th>
                    <th>{labels.sucesso}</th>
                    <th>Taxa</th>
                    {labels.temValor && <th>Valor recuperado</th>}
                    <th>Interações</th>
                  </tr>
                </thead>
                <tbody>
                  {colaboradores.map((c) => (
                    <tr key={c.colaboradorId}>
                      <td>{c.colaboradorNome}</td>
                      <td>{c.totalAlunos}</td>
                      <td>{c.sucesso}</td>
                      <td>
                        <span className="taxa-badge">{c.taxaConversao}%</span>
                      </td>
                      {labels.temValor && <td>{formatCurrency(c.valorRecuperado)}</td>}
                      <td>{c.totalInteracoes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="metricas-section">
        <h2>Canal de contato</h2>
        {canais.length === 0 ? (
          <p className="metricas-empty">Nenhum dado disponível ainda.</p>
        ) : (
          <div className="metricas-table-wrapper">
            <table className="metricas-table">
              <thead>
                <tr>
                  <th>Canal</th>
                  <th>Total</th>
                  <th>{labels.sucesso}</th>
                  <th>Taxa de conversão</th>
                </tr>
              </thead>
              <tbody>
                {canais.map((c) => (
                  <tr key={c.canal}>
                    <td>{getSourceLabel(c.canal)}</td>
                    <td>{c.total}</td>
                    <td>{c.sucesso}</td>
                    <td>
                      <span className="taxa-badge">{c.taxaConversao}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};

// =====================================================================
// Métricas cruzadas — comparativo de canal de contato entre as 3 áreas.
// Fica fora das abas porque não pertence a nenhum funil isolado; é a
// primeira métrica cruzada da lista combinada com o usuário — as demais
// (carga total por colaborador, retorno Retenção→Rematrícula, valor
// consolidado, risco × tempo de resposta, jornada multi-área) entram aqui
// como novas seções conforme forem implementadas.
// =====================================================================
const CANAIS_CONHECIDOS = ["whatsapp", "telefone", "email", "presencial", "ava", "indicacao", "outro"];

const MetricasCruzadas: React.FC = () => {
  const { showToast } = useToast();
  const [porArea, setPorArea] = useState<Record<Area, MetricaCanal[]> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    getMetricasCanaisCruzado().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) showToast("Erro ao carregar métricas cruzadas", "error");
      else setPorArea(data);
      setIsLoading(false);
    });
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading || !porArea) {
    return <div className="metricas-loading">Carregando métricas cruzadas...</div>;
  }

  const chartData = CANAIS_CONHECIDOS.map((canal) => {
    const linha: Record<string, number | string> = { canal: getSourceLabel(canal) };
    for (const area of PROCESSOS) {
      const entry = porArea[area].find((c) => c.canal === canal);
      linha[area] = entry?.taxaConversao ?? 0;
    }
    return linha;
  }).filter((linha) => PROCESSOS.some((area) => Number(linha[area]) > 0));

  return (
    <div className="metricas-section metricas-cruzado">
      <h2>Cruzado — canal de contato entre os 3 funis</h2>
      <p className="metricas-cruzado-subtitle">
        Taxa de conversão por canal, comparada lado a lado entre Rematrícula, Retenção e Engajamento.
      </p>
      {chartData.length === 0 ? (
        <p className="metricas-empty">Nenhum dado disponível ainda.</p>
      ) : (
        <div className="metricas-chart-wrapper" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--gray-200)" />
              <XAxis dataKey="canal" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(value) => [`${Number(value)}%`, "Taxa de conversão"]} contentStyle={{ fontSize: 13, borderRadius: 8 }} />
              <Legend
                formatter={(value) => AREA_CONFIG[value as Area]?.label ?? value}
                wrapperStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="rematricula" fill="#4C5FC7" radius={[4, 4, 0, 0]} />
              <Bar dataKey="retencao" fill="#C1729F" radius={[4, 4, 0, 0]} />
              <Bar dataKey="engajamento" fill="#639922" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
