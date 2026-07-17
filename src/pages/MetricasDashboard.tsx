import React, { useEffect, useState } from "react";
import {
  Users,
  TrendingUp,
  Wallet,
  MessageSquare,
  AlertTriangle,
} from "lucide-react";
import { useAlunos } from "../hooks/useAlunos";
import { useToast } from "../hooks/useToast";
import {
  getMetricasGerais,
  getMetricasColaboradores,
  getMetricasCanais,
} from "../services/metricasService";
import {
  MetricasGerais,
  MetricaColaborador,
  MetricaCanal,
} from "../types";
import { formatCurrency, getStatusColor, getStatusLabel } from "../utils/formatters";
import "./MetricasDashboard.css";

const MetricasDashboard: React.FC = () => {
  const { statusResumo, isAdmin } = useAlunos();
  const { showToast } = useToast();

  const [gerais, setGerais] = useState<MetricasGerais | null>(null);
  const [colaboradores, setColaboradores] = useState<MetricaColaborador[]>([]);
  const [canais, setCanais] = useState<MetricaCanal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setIsLoading(true);

      const requests: [
        ReturnType<typeof getMetricasGerais>,
        ReturnType<typeof getMetricasCanais>,
        ReturnType<typeof getMetricasColaboradores> | null
      ] = [getMetricasGerais(), getMetricasCanais(), isAdmin ? getMetricasColaboradores() : null];

      const [geraisRes, canaisRes, colaboradoresRes] = await Promise.all(requests);

      if (!isMounted) return;

      if (geraisRes.error) {
        showToast("Erro ao carregar métricas gerais", "error");
      } else {
        setGerais(geraisRes.data);
      }

      if (canaisRes.error) {
        showToast("Erro ao carregar métricas por canal", "error");
      } else {
        setCanais(canaisRes.data);
      }

      if (colaboradoresRes) {
        if (colaboradoresRes.error) {
          showToast("Erro ao carregar ranking de colaboradores", "error");
        } else {
          setColaboradores(colaboradoresRes.data);
        }
      }

      setIsLoading(false);
    };

    load();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const totalPipeline = statusResumo.reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="metricas">
      <div className="metricas-header">
        <div>
          <h1>Métricas</h1>
          <p className="metricas-subtitle">
            Visão consolidada do funil de rematrícula
          </p>
        </div>
      </div>

      {isLoading && !gerais ? (
        <div className="metricas-loading">Carregando métricas...</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon kpi-icon-primary">
                <Users size={20} />
              </div>
              <div className="kpi-content">
                <span className="kpi-label">Total na Carteira</span>
                <span className="kpi-value">{gerais?.totalAlunos ?? 0}</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon kpi-icon-success">
                <TrendingUp size={20} />
              </div>
              <div className="kpi-content">
                <span className="kpi-label">Rematriculados</span>
                <span className="kpi-value">
                  {gerais?.rematriculados ?? 0}
                  <span className="kpi-value-suffix">
                    ({gerais?.taxaConversao ?? 0}%)
                  </span>
                </span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon kpi-icon-secondary">
                <Wallet size={20} />
              </div>
              <div className="kpi-content">
                <span className="kpi-label">Valor Recuperado</span>
                <span className="kpi-value">
                  {formatCurrency(gerais?.valorRecuperado ?? 0)}
                </span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon kpi-icon-primary">
                <MessageSquare size={20} />
              </div>
              <div className="kpi-content">
                <span className="kpi-label">Interações Hoje</span>
                <span className="kpi-value">{gerais?.interacoesHoje ?? 0}</span>
              </div>
            </div>

            {isAdmin && (gerais?.alunosSemResponsavel ?? 0) > 0 && (
              <div className="kpi-card kpi-card-alert">
                <div className="kpi-icon kpi-icon-warning">
                  <AlertTriangle size={20} />
                </div>
                <div className="kpi-content">
                  <span className="kpi-label">Sem Responsável</span>
                  <span className="kpi-value">{gerais?.alunosSemResponsavel}</span>
                </div>
              </div>
            )}
          </div>

          {/* Pipeline por status */}
          <div className="metricas-section">
            <h2>Pipeline por Status</h2>
            <div className="pipeline-bars">
              {statusResumo.map((s) => {
                const pct = totalPipeline > 0 ? (s.total / totalPipeline) * 100 : 0;
                return (
                  <div className="pipeline-row" key={s.status}>
                    <span className="pipeline-label">{getStatusLabel(s.status)}</span>
                    <div className="pipeline-bar-track">
                      <div
                        className="pipeline-bar-fill"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: getStatusColor(s.status),
                        }}
                      />
                    </div>
                    <span className="pipeline-count">{s.total}</span>
                  </div>
                );
              })}
              {statusResumo.length === 0 && (
                <p className="metricas-empty">Nenhum dado disponível ainda.</p>
              )}
            </div>
          </div>

          {/* Ranking de colaboradores (só admin) */}
          {isAdmin && (
            <div className="metricas-section">
              <h2>Ranking de Colaboradores</h2>
              {colaboradores.length === 0 ? (
                <p className="metricas-empty">Nenhum colaborador com carteira ainda.</p>
              ) : (
                <div className="metricas-table-wrapper">
                  <table className="metricas-table">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Carteira</th>
                        <th>Rematriculados</th>
                        <th>Taxa</th>
                        <th>Valor Recuperado</th>
                        <th>Interações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {colaboradores.map((c) => (
                        <tr key={c.colaboradorId}>
                          <td>{c.colaboradorNome}</td>
                          <td>{c.totalAlunos}</td>
                          <td>{c.rematriculados}</td>
                          <td>
                            <span className="taxa-badge">{c.taxaConversao}%</span>
                          </td>
                          <td>{formatCurrency(c.valorRecuperado)}</td>
                          <td>{c.totalInteracoes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Canal de contato */}
          <div className="metricas-section">
            <h2>Canal de Contato</h2>
            {canais.length === 0 ? (
              <p className="metricas-empty">Nenhum dado disponível ainda.</p>
            ) : (
              <div className="metricas-table-wrapper">
                <table className="metricas-table">
                  <thead>
                    <tr>
                      <th>Canal</th>
                      <th>Total</th>
                      <th>Rematriculados</th>
                      <th>Taxa de Conversão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {canais.map((c) => (
                      <tr key={c.canal}>
                        <td style={{ textTransform: "capitalize" }}>{c.canal}</td>
                        <td>{c.total}</td>
                        <td>{c.rematriculados}</td>
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
      )}
    </div>
  );
};

export default MetricasDashboard;
