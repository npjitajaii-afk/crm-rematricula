import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { useNotificacoes } from "../hooks/useNotificacoes";
import { formatCurrency, formatDate } from "../utils/formatters";
import { Users, CheckCircle2, Bell, Wallet, Check } from "lucide-react";
import "./MinhaArea.css";

const MinhaArea: React.FC = () => {
  const navigate = useNavigate();
  const { alunos, isAdmin } = useAlunos();
  const { user } = useAuth();
  const { notificacoes, naoLidas, marcarLida, marcarTodasLidas } =
    useNotificacoes();

  const meusAlunos = useMemo(
    () =>
      isAdmin ? alunos : alunos.filter((a) => a.assignedTo === user?.id),
    [alunos, isAdmin, user]
  );

  const totais = useMemo(() => {
    const rematriculados = meusAlunos.filter(
      (a) => a.status === "rematriculado"
    ).length;
    const valorCarteira = meusAlunos.reduce(
      (soma, a) => soma + (a.value ?? 0),
      0
    );
    return { rematriculados, valorCarteira };
  }, [meusAlunos]);

  const alunosRecentes = useMemo(
    () =>
      [...meusAlunos]
        .sort(
          (a, b) =>
            new Date(b.updatedAt ?? b.createdAt).getTime() -
            new Date(a.updatedAt ?? a.createdAt).getTime()
        )
        .slice(0, 6),
    [meusAlunos]
  );

  return (
    <div className="minha-area-page">
      <div className="minha-area-header">
        <h1>Minha área</h1>
        <p className="minha-area-subtitle">
          Acompanhe seus alunos e notificações
        </p>
      </div>

      <div className="resumo-cards">
        <div className="resumo-card">
          <div className="resumo-icon resumo-icon-primary">
            <Users size={22} />
          </div>
          <div>
            <span className="resumo-numero">{meusAlunos.length}</span>
            <span className="resumo-label">Meus alunos</span>
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
          <div className="resumo-icon resumo-icon-primary">
            <Bell size={22} />
          </div>
          <div>
            <span className="resumo-numero">{naoLidas}</span>
            <span className="resumo-label">Notificações não lidas</span>
          </div>
        </div>

        <div className="resumo-card">
          <div className="resumo-icon resumo-icon-primary">
            <Wallet size={22} />
          </div>
          <div>
            <span className="resumo-numero">
              {formatCurrency(totais.valorCarteira)}
            </span>
            <span className="resumo-label">Valor em carteira</span>
          </div>
        </div>
      </div>

      <div className="minha-area-panels">
        <div className="panel-card">
          <div className="panel-header">
            <h2>
              <Bell size={18} />
              Notificações
            </h2>
            {naoLidas > 0 && (
              <button className="panel-link" onClick={marcarTodasLidas}>
                Marcar todas como lidas
              </button>
            )}
          </div>

          {notificacoes.length === 0 ? (
            <p className="lista-vazia">Nenhuma notificação.</p>
          ) : (
            <div className="notificacoes-lista">
              {notificacoes.slice(0, 6).map((n) => (
                <div
                  key={n.id}
                  className={`notificacao-item ${n.lida ? "lida" : ""}`}
                >
                  <div className="notificacao-texto">
                    <span className="notificacao-titulo">{n.titulo}</span>
                    {n.corpo && (
                      <span className="notificacao-corpo">{n.corpo}</span>
                    )}
                    <span className="notificacao-data">
                      {formatDate(n.createdAt)}
                    </span>
                  </div>
                  {!n.lida && (
                    <button
                      className="notificacao-check"
                      title="Marcar como lida"
                      onClick={() => marcarLida(n.id)}
                    >
                      <Check size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel-card">
          <div className="panel-header">
            <h2>Meus alunos recentes</h2>
          </div>

          {alunosRecentes.length === 0 ? (
            <p className="lista-vazia">Nenhum aluno ainda.</p>
          ) : (
            <div className="alunos-recentes-lista">
              {alunosRecentes.map((aluno) => (
                <button
                  key={aluno.id}
                  className="aluno-recente-item"
                  onClick={() => navigate(`/alunos/${aluno.id}`)}
                >
                  <div className="aluno-recente-texto">
                    <span className="aluno-recente-nome">{aluno.name}</span>
                    <span className="aluno-recente-status">
                      {aluno.status}
                    </span>
                  </div>
                  <span className="aluno-recente-seta">—</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MinhaArea;