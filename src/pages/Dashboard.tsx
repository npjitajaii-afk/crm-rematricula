import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAlunos } from "../hooks/useAlunos";
import { formatCurrency, getStatusLabel } from "../utils/formatters";
import {
  Users,
  CheckCircle2,
  Clock,
  DollarSign,
  Plus,
  BarChart2,
  Layers,
  CircleUserRound,
  GraduationCap,
  HeartPulse,
  Sparkles,
  X,
} from "lucide-react";
import "./Dashboard.css";

// Status que ainda estão "em andamento" (nem recém cadastrado, nem já resolvido)
const STATUS_PENDENTES = [
  "pendente",
  "contatado",
  "aguardando_retorno",
  "confirmado",
  "documentacao",
  "aguardando_matricula",
];

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { alunos, statusResumo } = useAlunos();
  const [showFunilChooser, setShowFunilChooser] = useState(false);

  const totais = useMemo(() => {
    // Este dashboard é a visão geral do funil de Rematrícula (ver
    // README.md seção 1 — métricas continuam exclusivas dessa área por
    // enquanto), então não soma alunos de Retenção/Engajamento aqui.
    const alunosRematricula = alunos.filter((a) => a.area === "rematricula");
    const totalAlunos = alunosRematricula.length;
    const rematriculados = alunosRematricula.filter(
      (a) => a.status === "rematriculado"
    ).length;
    const pendentes = alunosRematricula.filter((a) =>
      STATUS_PENDENTES.includes(a.status)
    ).length;
    const valorPendente = alunosRematricula.reduce(
      (soma, a) => soma + (a.value ?? 0),
      0
    );
    return { totalAlunos, rematriculados, pendentes, valorPendente };
  }, [alunos]);

  const pipelineOrdenado = useMemo(
    () =>
      [...statusResumo]
        .filter((r) => r.total > 0)
        .sort((a, b) =>
          getStatusLabel(a.status).localeCompare(getStatusLabel(b.status))
        ),
    [statusResumo]
  );

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p className="dashboard-subtitle">
            Visão geral do pipeline de rematrícula
          </p>
        </div>
      </div>

      <div className="resumo-cards">
        <div className="resumo-card">
          <div className="resumo-icon resumo-icon-primary">
            <Users size={22} />
          </div>
          <div>
            <span className="resumo-numero">{totais.totalAlunos}</span>
            <span className="resumo-label">Total de alunos</span>
          </div>
        </div>

        <div className="resumo-card">
          <div className="resumo-icon resumo-icon-success">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <span className="resumo-numero">{totais.rematriculados}</span>
            <span className="resumo-label">Rematriculados</span>
          </div>
        </div>

        <div className="resumo-card">
          <div className="resumo-icon resumo-icon-warning">
            <Clock size={22} />
          </div>
          <div>
            <span className="resumo-numero">{totais.pendentes}</span>
            <span className="resumo-label">Pendentes</span>
          </div>
        </div>

        <div className="resumo-card">
          <div className="resumo-icon resumo-icon-primary">
            <DollarSign size={22} />
          </div>
          <div>
            <span className="resumo-numero">
              {formatCurrency(totais.valorPendente)}
            </span>
            <span className="resumo-label">Valor pendente</span>
          </div>
        </div>
      </div>

      <div className="dashboard-panels">
        <div className="panel-card">
          <div className="panel-header">
            <h2>Pipeline</h2>
            <button className="panel-link" onClick={() => navigate("/alunos")}>
              Ver alunos
            </button>
          </div>
          <div className="pipeline-list">
            {pipelineOrdenado.length === 0 ? (
              <p className="pipeline-vazio">Nenhum aluno cadastrado ainda.</p>
            ) : (
              pipelineOrdenado.map((item) => (
                <div key={item.status} className="pipeline-row">
                  <span className="pipeline-dot" data-status={item.status} />
                  <span className="pipeline-nome">
                    {getStatusLabel(item.status)}
                  </span>
                  <span className="pipeline-total">{item.total}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel-card">
          <div className="panel-header">
            <h2>Acesso rápido</h2>
          </div>
          <div className="acesso-rapido-grid">
            <button
              className="acesso-rapido-btn"
              onClick={() => setShowFunilChooser(true)}
            >
              <Plus size={18} />
              Novo aluno
            </button>
            <button
              className="acesso-rapido-btn"
              onClick={() => navigate("/metricas")}
            >
              <BarChart2 size={18} />
              Métricas detalhadas
            </button>
            <button
              className="acesso-rapido-btn"
              onClick={() => navigate("/grupos")}
            >
              <Layers size={18} />
              Segmentação
            </button>
            <button
              className="acesso-rapido-btn"
              onClick={() => navigate("/minha-area")}
            >
              <CircleUserRound size={18} />
              Minha área
            </button>
          </div>
        </div>
      </div>

      {showFunilChooser && (
        <div
          className="funil-chooser-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowFunilChooser(false);
          }}
        >
          <section className="funil-chooser" role="dialog" aria-modal="true" aria-labelledby="funil-chooser-title">
            <button
              type="button"
              className="funil-chooser-close"
              onClick={() => setShowFunilChooser(false)}
              aria-label="Fechar"
            >
              <X size={19} />
            </button>
            <h2 id="funil-chooser-title">Em qual funil deseja adicionar?</h2>
            <p>Escolha o destino do novo aluno antes de iniciar o cadastro.</p>
            <div className="funil-chooser-options">
              <button type="button" className="funil-option funil-option--rematricula" onClick={() => navigate("/alunos/new")}>
                <GraduationCap size={22} />
                <span><strong>Rematrícula</strong><small>Acompanhar renovação de matrícula</small></span>
              </button>
              <button type="button" className="funil-option funil-option--engajamento" onClick={() => navigate("/engajamento/novo")}>
                <Sparkles size={22} />
                <span><strong>Engajamento</strong><small>Acompanhar novos alunos</small></span>
              </button>
              <button type="button" className="funil-option funil-option--retencao" onClick={() => navigate("/retencao/novo")}>
                <HeartPulse size={22} />
                <span><strong>Retenção</strong><small>Atuar em casos de risco de evasão</small></span>
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
