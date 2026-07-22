/**
 * gruposService.ts
 *
 * Segmentação automática dos alunos por combinação de status + tags.
 * Não é uma entidade persistida: é uma visão derivada, calculada em
 * memória a partir dos alunos já carregados no AlunosContext.
 *
 * Regras (ver documento de planejamento da aba Grupos):
 *  - Alunos "Desistente" ficam de fora (casos encerrados).
 *  - Chave do grupo = status + tags ordenadas alfabeticamente.
 *  - Grupos com poucos alunos (< TAMANHO_MINIMO_GRUPO) são agrupados no
 *    bucket "Outros" em vez de aparecer sozinhos na tela.
 */

import { Aluno, AlunoStatus } from "../types";

export interface Grupo {
  chave: string;
  status: AlunoStatus;
  tags: string[]; // já ordenadas
  alunos: Aluno[];
  total: number;
}

export const TAMANHO_MINIMO_GRUPO = 3;

function ordenarTags(tags: string[] | undefined): string[] {
  return [...(tags ?? [])].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function montarChave(status: AlunoStatus, tagsOrdenadas: string[]): string {
  const parteTags = tagsOrdenadas.length ? tagsOrdenadas.join(", ") : "(sem tags)";
  return `${status} | ${parteTags}`;
}

export interface GruposResultado {
  /** Grupos "normais", com total >= TAMANHO_MINIMO_GRUPO, ordenados do maior pro menor. */
  grupos: Grupo[];
  /** Grupos pequenos (< TAMANHO_MINIMO_GRUPO) que caem no bucket "Outros". */
  outros: Grupo[];
  /** Soma de alunos dentro de "outros", pronta pra exibir no card do bucket. */
  totalOutros: number;
}

export function calcularGrupos(alunos: Aluno[]): GruposResultado {
  const ativos = alunos.filter((aluno) => aluno.status !== "desistente");

  const mapa = new Map<string, Grupo>();

  for (const aluno of ativos) {
    const tagsOrdenadas = ordenarTags(aluno.tags);
    const chave = montarChave(aluno.status, tagsOrdenadas);

    let grupo = mapa.get(chave);
    if (!grupo) {
      grupo = { chave, status: aluno.status, tags: tagsOrdenadas, alunos: [], total: 0 };
      mapa.set(chave, grupo);
    }
    grupo.alunos.push(aluno);
    grupo.total += 1;
  }

  const todos = Array.from(mapa.values()).sort((a, b) => b.total - a.total);

  const grupos = todos.filter((g) => g.total >= TAMANHO_MINIMO_GRUPO);
  const outros = todos.filter((g) => g.total < TAMANHO_MINIMO_GRUPO);
  const totalOutros = outros.reduce((acc, g) => acc + g.total, 0);

  return { grupos, outros, totalOutros };
}
