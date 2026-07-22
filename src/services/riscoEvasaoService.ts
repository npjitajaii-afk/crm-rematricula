/**
 * riscoEvasaoService.ts
 *
 * Calcula o score de risco de evasão para cada aluno com base em:
 *   score = (pontosStatus + pontosTags) × multiplicadorTempo
 *
 * Faixas de risco:
 *   0–29   → baixo   (verde)
 *   30–59  → medio   (amarelo)
 *   60–84  → alto    (laranja)
 *   85+    → critico (vermelho)
 */

import { Aluno, AlunoStatus, AlunoRisco, FaixaRisco } from "../types";
import { TagAluno } from "../utils/tags";

// ------------------------------------------------------------------
// Pontos por status
// ------------------------------------------------------------------
const PONTOS_STATUS: Record<AlunoStatus, number> = {
  cadastrado:           30,
  pendente:             25,
  contatado:            15,
  aguardando_retorno:   20,
  confirmado:            5,
  documentacao:         10,
  aguardando_matricula:  8,
  matricula_confirmada:  2,
  rematriculado:         0,
  desistente:            0,
};

// ------------------------------------------------------------------
// Pontos por tag
// ------------------------------------------------------------------
const PONTOS_TAGS: Record<TagAluno, number> = {
  "Calouro":              5,
  "Veterano":            -5,
  "Renegociação":        10,
  "Mensalidade Devida":  20,
  "Mensalidade Paga":   -10,
  "Ausência de Suporte": 15,
  "Notas Baixas":        15,
};

// ------------------------------------------------------------------
// Multiplicador de tempo (dias parado no mesmo status)
// ------------------------------------------------------------------
function calcularMultiplicadorTempo(dias: number): number {
  if (dias <= 3)  return 1.0;
  if (dias <= 7)  return 1.2;
  if (dias <= 14) return 1.5;
  if (dias <= 30) return 1.8;
  return 2.2;
}

// ------------------------------------------------------------------
// Faixa de risco a partir do score final
// ------------------------------------------------------------------
function calcularFaixa(score: number): FaixaRisco {
  if (score < 30) return "baixo";
  if (score < 60) return "medio";
  if (score < 85) return "alto";
  return "critico";
}

// ------------------------------------------------------------------
// Cálculo para um aluno
// ------------------------------------------------------------------
export function calcularRiscoAluno(aluno: Aluno): AlunoRisco {
  const referencia = aluno.statusAtualizadoEm ?? aluno.updatedAt ?? aluno.createdAt;
  const diasNoStatus = Math.floor(
    (Date.now() - new Date(referencia).getTime()) / (1000 * 60 * 60 * 24)
  );

  const pontosStatus = PONTOS_STATUS[aluno.status] ?? 0;

  const pontosTags = (aluno.tags ?? []).reduce((acc, tag) => {
    return acc + (PONTOS_TAGS[tag as TagAluno] ?? 0);
  }, 0);

  const multiplicadorTempo = calcularMultiplicadorTempo(diasNoStatus);
  const score = Math.max(0, Math.round((pontosStatus + pontosTags) * multiplicadorTempo));

  return {
    aluno,
    score,
    faixa: calcularFaixa(score),
    diasNoStatus,
    detalhes: { pontosStatus, pontosTags, multiplicadorTempo },
  };
}

// ------------------------------------------------------------------
// Calcula para lista — exclui rematriculados e desistentes
// ------------------------------------------------------------------
export function calcularRiscoLista(alunos: Aluno[]): AlunoRisco[] {
  return alunos
    .filter(
      (aluno) => aluno.status !== "rematriculado" && aluno.status !== "desistente"
    )
    .map(calcularRiscoAluno)
    .sort((a, b) => b.score - a.score);
}

// ------------------------------------------------------------------
// Resumo por faixa — usado nos cards de filtro da tela
// ------------------------------------------------------------------
export function calcularResumoRisco(
  riscos: AlunoRisco[]
): Record<FaixaRisco, number> {
  const resumo: Record<FaixaRisco, number> = {
    critico: 0,
    alto: 0,
    medio: 0,
    baixo: 0,
  };

  for (const risco of riscos) {
    resumo[risco.faixa]++;
  }

  return resumo;
}