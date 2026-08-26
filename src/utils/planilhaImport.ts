/**
 * Utilitários compartilhados para importação de planilhas (Rematrícula e
 * Engajamento).
 *
 * Motivação: não dá pra exigir que a planilha chegue "tratada" (cabeçalho
 * limpo, mesma ordem/nome de colunas de sempre). Em vez de casar cada
 * campo do card com um nome de coluna fixo, este módulo:
 *
 *  1) normaliza os cabeçalhos (acentos, maiúsculas, pontuação variada);
 *  2) tenta casar cada campo por uma lista ampla de apelidos conhecidos
 *     (fase "exata");
 *  3) se nenhum apelido bateu, tenta achar a coluna por palavras-chave
 *     dentro do nome do cabeçalho, evitando colunas já usadas por outro
 *     campo e colunas com palavras que claramente pertencem a outro campo
 *     (fase "aproximada");
 *  4) tenta localizar a linha de cabeçalho automaticamente, pro caso de a
 *     planilha ter linhas de título/logo antes da tabela em si.
 */

/** Remove acentos, deixa maiúsculo e troca qualquer separador por "_". */
export function normalizeHeader(key: string): string {
  return key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Normaliza as chaves de uma linha (objeto vindo do sheet_to_json). */
export function normalizeRow(row: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  Object.entries(row).forEach(([key, value]) => {
    const normalizedKey = normalizeHeader(key);
    if (!normalizedKey) return;
    // Se duas colunas diferentes normalizam pro mesmo nome (ex: "E-mail" e
    // "E_MAIL"), mantém a primeira que tiver conteúdo em vez de sobrescrever
    // silenciosamente com uma célula vazia.
    const cellValue = value != null ? String(value).trim() : "";
    if (normalized[normalizedKey] && !cellValue) return;
    normalized[normalizedKey] = cellValue;
  });
  return normalized;
}

export interface FieldSpec {
  /** Nome do campo no resultado (ex: "nome", "email"). */
  field: string;
  /** Nomes de cabeçalho já normalizados que casam direto (match exato). */
  aliases: string[];
  /**
   * Palavras (já normalizadas) usadas na fase aproximada: a coluna é aceita
   * se o cabeçalho contiver algum desses "tokens" separado por "_".
   */
  keywords?: string[];
  /**
   * Palavras que, se presentes no cabeçalho, DESCARTAM ele como candidato
   * pra esse campo na fase aproximada (evita, ex: "NOME_CURSO" cair no
   * campo "nome" do aluno).
   */
  exclude?: string[];
}

/**
 * Casa cada campo de `specs` com no máximo uma coluna da linha já
 * normalizada, sem deixar duas specs "roubarem" a mesma coluna.
 * Roda em duas passadas (todas as specs por apelido exato, depois todas
 * por aproximação) pra priorizar sempre o match exato quando existir em
 * qualquer campo, antes de arriscar um match aproximado.
 */
export function pickFields(
  row: Record<string, string>,
  specs: FieldSpec[]
): Record<string, string> {
  const result: Record<string, string> = {};
  const usedHeaders = new Set<string>();
  const availableHeaders = Object.keys(row);

  // Fase 1: apelido exato.
  for (const spec of specs) {
    for (const alias of spec.aliases) {
      if (usedHeaders.has(alias)) continue;
      if (row[alias]) {
        result[spec.field] = row[alias];
        usedHeaders.add(alias);
        break;
      }
    }
  }

  // Fase 2: aproximação por palavra-chave, só pra quem ainda não achou nada.
  for (const spec of specs) {
    if (result[spec.field] || !spec.keywords || spec.keywords.length === 0) continue;

    const candidato = availableHeaders.find((header) => {
      if (usedHeaders.has(header)) return false;
      if (!row[header]) return false;
      const tokens = header.split("_");
      const temPalavraChave = spec.keywords!.some((kw) => tokens.includes(kw));
      if (!temPalavraChave) return false;
      const temExclusao = (spec.exclude || []).some((ex) => tokens.includes(ex));
      return !temExclusao;
    });

    if (candidato) {
      result[spec.field] = row[candidato];
      usedHeaders.add(candidato);
    }
  }

  return result;
}

/**
 * Procura, dentre as primeiras `maxRows` linhas cruas (array de arrays,
 * como retornado por `sheet_to_json(sheet, { header: 1 })`), a primeira
 * linha que pareça ser o cabeçalho de verdade — útil quando a planilha
 * tem linhas de título, logo ou instruções antes da tabela.
 *
 * Considera cabeçalho a primeira linha que contiver pelo menos
 * `minMatches` células cujo valor normalizado bata com algum dos grupos
 * de palavras-chave esperadas (cada grupo representa um campo).
 */
export function findHeaderRowIndex(
  rows: unknown[][],
  expectedFieldKeywords: string[][],
  minMatches = 2,
  maxRows = 20
): number {
  const limit = Math.min(rows.length, maxRows);
  for (let i = 0; i < limit; i += 1) {
    const cells = (rows[i] || []).map((cell) => normalizeHeader(String(cell ?? "")));
    let matches = 0;
    for (const group of expectedFieldKeywords) {
      if (cells.some((cell) => group.includes(cell) || group.some((kw) => cell.split("_").includes(kw)))) {
        matches += 1;
      }
    }
    if (matches >= minMatches) return i;
  }
  return 0;
}
