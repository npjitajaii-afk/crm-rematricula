/** Entrada de anotação salva como JSON em alunos.observacoes */
export interface AnotacaoEntry {
  id: string;
  texto: string;
  autorNome: string;
  autorId: string;
  criadaEm: string;
}

/**
 * Interpreta o campo observations:
 * - JSON array de anotações (formato atual do Engajamento)
 * - texto simples legado
 */
export function parseAnotacoes(raw: string | undefined | null): AnotacaoEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((a, i) => ({
        id: String(a?.id ?? `n-${i}`),
        texto: String(a?.texto ?? ""),
        autorNome: String(a?.autorNome ?? "—"),
        autorId: String(a?.autorId ?? ""),
        criadaEm: String(a?.criadaEm ?? ""),
      }));
    }
  } catch {
    /* texto legado */
  }
  return [
    {
      id: "legado",
      texto: raw,
      autorNome: "—",
      autorId: "",
      criadaEm: "",
    },
  ];
}

/** Texto plano para exportação / resumo em uma linha. */
export function flattenObservacoes(raw: string | undefined | null): string {
  const list = parseAnotacoes(raw);
  return list
    .map((a) =>
      a.texto
        ? `${a.autorNome && a.autorNome !== "—" ? a.autorNome + ": " : ""}${a.texto}`
        : ""
    )
    .filter(Boolean)
    .join(" | ");
}
