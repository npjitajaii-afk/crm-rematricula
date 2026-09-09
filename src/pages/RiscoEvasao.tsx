import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAlunos } from "../hooks/useAlunos";
import { calcularRiscoLista } from "../services/riscoEvasaoService";
import { AlunoRisco, FaixaRisco } from "../types";
import { AlertTriangle, TrendingDown, Clock, ChevronRight } from "lucide-react";
import RematriculaTabs from "../components/RematriculaTabs";
import "./RiscoEvasao.css";

/** Limites inclusivos do score por faixa. */
const LIMITE: Record<FaixaRisco, { min: number; max: number }> = {
  baixo: { min: 0, max: 29 },
  medio: { min: 30, max: 59 },
  alto: { min: 60, max: 84 },
  critico: { min: 85, max: 9999 },
};

function normalizarScore(score: unknown): number {
  const n = typeof score === "number" ? score : Number(score);
  return Number.isFinite(n) ? n : 0;
}

function faixaDoScore(score: unknown): FaixaRisco {
  const s = normalizarScore(score);
  if (s <= 29) return "baixo";
  if (s <= 59) return "medio";
  if (s <= 84) return "alto";
  return "critico";
}

const FAIXAS_ORDEM: FaixaRisco[] = ["critico", "alto", "medio", "baixo"];

const FAIXA_CONFIG: Record<
  FaixaRisco,
  { label: string; cls: string; range: string }
> = {
  critico: { label: "Crítico", cls: "faixa-critico", range: "85+" },
  alto: { label: "Alto", cls: "faixa-alto", range: "60–84" },
  medio: { label: "Médio", cls: "faixa-medio", range: "30–59" },
  baixo: { label: "Baixo", cls: "faixa-baixo", range: "0–29" },
};

const STATUS_LABEL: Record<string, string> = {
  cadastrado: "Cadastrado",
  pendente: "Pendente de Contato",
  contatado: "Contato Realizado",
  aguardando_retorno: "Aguardando Retorno",
  confirmado: "Confirmou Interesse",
  documentacao: "Documentação/Pagamento",
  aguardando_matricula: "Aguardando Matrícula",
  matricula_confirmada: "Matrícula Confirmada",
};

const RiscoEvasao: React.FC = () => {
  const { alunos, isLoadingAlunos } = useAlunos();
  const navigate = useNavigate();
  const [filtroFaixa, setFiltroFaixa] = useState<FaixaRisco | "todos">("todos");

  const alunosRematricula = useMemo(
    () => alunos.filter((a) => a.area === "rematricula"),
    [alunos]
  );

  const riscos = useMemo(
    () => calcularRiscoLista(alunosRematricula),
    [alunosRematricula]
  );

  /**
   * Quatro listas separadas por score. O clique no card só escolhe
   * qual lista renderizar — não depende de .filter em cima de um array
   * compartilhado (evita bug de HMR / estado intermediário).
   */
  const porFaixa = useMemo(() => {
    const buckets: Record<FaixaRisco, AlunoRisco[]> = {
      critico: [],
      alto: [],
      medio: [],
      baixo: [],
    };
    for (const r of riscos) {
      const faixa = faixaDoScore(r.score);
      buckets[faixa].push(r);
    }
    return buckets;
  }, [riscos]);

  const resumo: Record<FaixaRisco, number> = {
    critico: porFaixa.critico.length,
    alto: porFaixa.alto.length,
    medio: porFaixa.medio.length,
    baixo: porFaixa.baixo.length,
  };

  // Lista que a tela realmente mostra
  const listaVisivel: AlunoRisco[] =
    filtroFaixa === "todos" ? riscos : porFaixa[filtroFaixa];

  const selecionarFaixa = (faixa: FaixaRisco) => {
    setFiltroFaixa((prev) => (prev === faixa ? "todos" : faixa));
  };

  return (
    <div className="risco-page">
      <RematriculaTabs />

      <div className="risco-header">
        <div className="risco-header-title">
          <AlertTriangle size={22} />
          <h1>Risco de Evasão</h1>
        </div>
        <p className="risco-subtitle">
          Clique em Crítico, Alto, Médio ou Baixo para ver apenas os contatos
          daquele nível de risco.
        </p>
      </div>

      <div
        className="risco-resumo"
        role="group"
        aria-label="Filtrar por faixa de risco"
      >
        {FAIXAS_ORDEM.map((faixa) => {
          const ativo = filtroFaixa === faixa;
          return (
            <button
              key={faixa}
              type="button"
              className={`risco-faixa-card risco-faixa-${faixa}${
                ativo ? " ativo" : ""
              }`}
              onClick={() => selecionarFaixa(faixa)}
              aria-pressed={ativo}
            >
              <span className="resumo-numero">{resumo[faixa]}</span>
              <span className="resumo-label">{FAIXA_CONFIG[faixa].label}</span>
              <span className="resumo-range">{FAIXA_CONFIG[faixa].range}</span>
            </button>
          );
        })}
      </div>

      {filtroFaixa !== "todos" && (
        <div className="risco-filtro-ativo">
          Filtrando: <strong>{FAIXA_CONFIG[filtroFaixa].label}</strong>
          <span className="risco-filtro-contagem">
            score {FAIXA_CONFIG[filtroFaixa].range} · {listaVisivel.length} de{" "}
            {riscos.length}
          </span>
          <button
            type="button"
            className="btn-limpar-filtro"
            onClick={() => setFiltroFaixa("todos")}
          >
            × Limpar
          </button>
        </div>
      )}

      {isLoadingAlunos && riscos.length === 0 ? (
        <div className="risco-vazio">
          <p>Carregando alunos…</p>
        </div>
      ) : listaVisivel.length === 0 ? (
        <div className="risco-vazio">
          <TrendingDown size={48} />
          <p>
            {filtroFaixa === "todos"
              ? "Nenhum aluno elegível para cálculo de risco."
              : `Nenhum contato na faixa ${FAIXA_CONFIG[filtroFaixa].label} (score ${FAIXA_CONFIG[filtroFaixa].range}).`}
          </p>
          {filtroFaixa !== "todos" && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setFiltroFaixa("todos")}
            >
              Ver todos
            </button>
          )}
        </div>
      ) : (
        <div className="risco-lista" key={`lista-${filtroFaixa}-${listaVisivel.length}`}>
          {listaVisivel.map((r) => {
            const faixa = faixaDoScore(r.score);
            const cfg = FAIXA_CONFIG[faixa];
            // Segurança: se por algum motivo um item fora da faixa vazar, não renderiza
            if (
              filtroFaixa !== "todos" &&
              (normalizarScore(r.score) < LIMITE[filtroFaixa].min ||
                normalizarScore(r.score) > LIMITE[filtroFaixa].max)
            ) {
              return null;
            }
            return (
              <div
                key={r.aluno.id}
                className={`risco-item ${cfg.cls}`}
                data-score={normalizarScore(r.score)}
                data-faixa={faixa}
                onClick={() => navigate(`/alunos/${r.aluno.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) =>
                  e.key === "Enter" && navigate(`/alunos/${r.aluno.id}`)
                }
              >
                <div className="risco-score-col">
                  <span className="risco-score">{normalizarScore(r.score)}</span>
                  <span className={`faixa-badge ${cfg.cls}`}>{cfg.label}</span>
                </div>

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
                        <span key={t} className="risco-tag">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="risco-meta">
                  <span className="risco-status-label">
                    {STATUS_LABEL[r.aluno.status] ?? r.aluno.status}
                  </span>
                  <span className="risco-dias">
                    <Clock size={13} />
                    {r.diasNoStatus === 0
                      ? "hoje"
                      : `${r.diasNoStatus}d no status`}
                  </span>
                </div>

                <ChevronRight size={18} className="risco-chevron" />
              </div>
            );
          })}
        </div>
      )}

      <details className="risco-legenda">
        <summary>Como o score é calculado?</summary>
        <div className="legenda-corpo">
          <p>
            <strong>
              score = (pontos do status + pontos das etiquetas) × multiplicador
              de tempo
            </strong>
          </p>
          <ul>
            <li>
              Status mais distantes da rematrícula somam mais pontos (Cadastrado
              = 30, Contatado = 15…).
            </li>
            <li>
              Etiquetas de risco aumentam o score (Mensalidade Devida +20, Notas
              Baixas +15); Mensalidade Paga (−10) e Veterano (−5) reduzem.
            </li>
            <li>
              Multiplicador de tempo: ≤3d = 1× · ≤7d = 1,2× · ≤14d = 1,5× · ≤30d
              = 1,8× · +30d = 2,2×.
            </li>
            <li>
              Faixas: 0–29 Baixo · 30–59 Médio · 60–84 Alto · 85+ Crítico.
            </li>
          </ul>
        </div>
      </details>
    </div>
  );
};

export default RiscoEvasao;
