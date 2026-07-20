import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAlunos } from "../hooks/useAlunos";
import {
  calcularRiscoLista,
  calcularResumoRisco,
} from "../services/riscoEvasaoService";
import { AlunoRisco, FaixaRisco } from "../types";
import { AlertTriangle, TrendingDown, Clock, ChevronRight } from "lucide-react";
import "./RiscoEvasao.css";

const FAIXA_CONFIG: Record<FaixaRisco, { label: string; cls: string }> = {
  critico: { label: "Crítico", cls: "faixa-critico" },
  alto:    { label: "Alto",    cls: "faixa-alto"    },
  medio:   { label: "Médio",   cls: "faixa-medio"   },
  baixo:   { label: "Baixo",   cls: "faixa-baixo"   },
};

const STATUS_LABEL: Record<string, string> = {
  cadastrado:           "Cadastrado",
  pendente:             "Pendente de Contato",
  contatado:            "Contato Realizado",
  aguardando_retorno:   "Aguardando Retorno",
  confirmado:           "Confirmou Interesse",
  documentacao:         "Documentação/Pagamento",
  aguardando_matricula: "Aguardando Matrícula",
  matricula_confirmada: "Matrícula Confirmada",
};

const RiscoEvasao: React.FC = () => {
  const { alunos } = useAlunos();
  const navigate = useNavigate();
  const [filtroFaixa, setFiltroFaixa] = useState<FaixaRisco | "todos">("todos");

  const riscos = useMemo(() => calcularRiscoLista(alunos), [alunos]);
  const resumo = useMemo(() => calcularResumoRisco(riscos), [riscos]);

  const riscosFiltrados = useMemo(
    () => filtroFaixa === "todos" ? riscos : riscos.filter((r) => r.faixa === filtroFaixa),
    [riscos, filtroFaixa]
  );

  const toggleFiltro = (faixa: FaixaRisco) =>
    setFiltroFaixa((prev) => (prev === faixa ? "todos" : faixa));

  return (
    <div className="risco-page">

      {/* Cabeçalho */}
      <div className="risco-header">
        <div className="risco-header-title">
          <AlertTriangle size={22} />
          <h1>Risco de Evasão</h1>
        </div>
        <p className="risco-subtitle">
          Score calculado por status + etiquetas × tempo parado no status.
          Rematriculados e desistentes são excluídos.
        </p>
      </div>

      {/* Cards de resumo / filtro */}
      <div className="risco-resumo">
        {(["critico", "alto", "medio", "baixo"] as FaixaRisco[]).map((faixa) => (
          <button
            key={faixa}
            className={`resumo-card resumo-${faixa} ${filtroFaixa === faixa ? "ativo" : ""}`}
            onClick={() => toggleFiltro(faixa)}
          >
            <span className="resumo-numero">{resumo[faixa]}</span>
            <span className="resumo-label">{FAIXA_CONFIG[faixa].label}</span>
          </button>
        ))}
      </div>

      {/* Indicador de filtro ativo */}
      {filtroFaixa !== "todos" && (
        <div className="risco-filtro-ativo">
          Filtrando: <strong>{FAIXA_CONFIG[filtroFaixa].label}</strong>
          <button className="btn-limpar-filtro" onClick={() => setFiltroFaixa("todos")}>
            × Limpar
          </button>
        </div>
      )}

      {/* Lista */}
      {riscosFiltrados.length === 0 ? (
        <div className="risco-vazio">
          <TrendingDown size={48} />
          <p>Nenhum aluno nesta faixa de risco.</p>
        </div>
      ) : (
        <div className="risco-lista">
          {riscosFiltrados.map((r: AlunoRisco) => (
            <div
              key={r.aluno.id}
              className={`risco-item ${FAIXA_CONFIG[r.faixa].cls}`}
              onClick={() => navigate(`/alunos/${r.aluno.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && navigate(`/alunos/${r.aluno.id}`)}
            >
              {/* Score */}
              <div className="risco-score-col">
                <span className="risco-score">{r.score}</span>
                <span className={`faixa-badge ${FAIXA_CONFIG[r.faixa].cls}`}>
                  {FAIXA_CONFIG[r.faixa].label}
                </span>
              </div>

              {/* Info */}
              <div className="risco-info">
                <span className="risco-nome">{r.aluno.name}</span>
                <span className="risco-detalhe">
                  {[r.aluno.curso, r.aluno.ra ? `RA ${r.aluno.ra}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {(r.aluno.tags ?? []).length > 0 && (
                  <div className="risco-tags">
                    {(r.aluno.tags ?? []).map((t) => (
                      <span key={t} className="risco-tag">{t}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Status + dias */}
              <div className="risco-meta">
                <span className="risco-status-label">
                  {STATUS_LABEL[r.aluno.status] ?? r.aluno.status}
                </span>
                <span className="risco-dias">
                  <Clock size={13} />
                  {r.diasNoStatus === 0 ? "hoje" : `${r.diasNoStatus}d no status`}
                </span>
              </div>

              <ChevronRight size={18} className="risco-chevron" />
            </div>
          ))}
        </div>
      )}

      {/* Legenda */}
      <details className="risco-legenda">
        <summary>Como o score é calculado?</summary>
        <div className="legenda-corpo">
          <p>
            <strong>score = (pontos do status + pontos das etiquetas) × multiplicador de tempo</strong>
          </p>
          <ul>
            <li>Status mais distantes da rematrícula somam mais pontos (Cadastrado = 30, Contatado = 15…).</li>
            <li>Etiquetas de risco aumentam o score (Mensalidade Devida +20, Notas Baixas +15); Mensalidade Paga (−10) e Veterano (−5) reduzem.</li>
            <li>Multiplicador de tempo: ≤3d = 1× · ≤7d = 1,2× · ≤14d = 1,5× · ≤30d = 1,8× · +30d = 2,2×.</li>
            <li>Faixas: 0–29 Baixo · 30–59 Médio · 60–84 Alto · 85+ Crítico.</li>
          </ul>
        </div>
      </details>

    </div>
  );
};

export default RiscoEvasao;