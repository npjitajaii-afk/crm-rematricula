// Tags disponíveis na área de Rematrícula.
export const TAGS_REMATRICULA = [
  "Calouro",
  "Nova Matrícula", // uso interno/automático (fluxo de Engajamento), não é chip clicável em formulário
  "Veterano",
  "Renegociação",
  "Mensalidade Devida",
  "Mensalidade Paga",
  "Ausência de Suporte",
  "Notas Baixas",
] as const;

// Tags disponíveis na área de Engajamento.
export const TAGS_ENGAJAMENTO = [
  "Calouro",
  "Nova Matrícula", // uso interno/automático, aplicada ao salvar (ver AlunoForm)
  "Tem Acesso",
  "Não Tem Acesso",
  "Contrato Aceito",
  "Contrato Não Aceito",
  "Assistiu as Aulas",
  "Não Assistiu as Aulas",
  "Notas Baixas",
  "Reprovou na Disciplina",
  "Disciplina Aprovada",
  "Realizou as Provas",
  "Não Realizou as Provas",
  "Pagou o Boleto",
  "Não Pagou",
  "Matrícula Confirmada",
] as const;

export type TagAluno =
  | (typeof TAGS_REMATRICULA)[number]
  | (typeof TAGS_ENGAJAMENTO)[number];

// Lista combinada de todas as tags existentes no sistema, sem duplicatas —
// usada em locais que não diferenciam área, como o filtro de tags em Grupos.
export const TAGS_DISPONIVEIS: TagAluno[] = Array.from(
  new Set<TagAluno>([...TAGS_REMATRICULA, ...TAGS_ENGAJAMENTO])
);

// Tags oferecidas nos seletores manuais de formulário, por área. "Nova
// Matrícula" fica de fora porque é aplicada automaticamente pelo sistema no
// cadastro via Engajamento (ver README.md seção 4) e nunca deve ser marcada
// à mão.
export const TAGS_SELECIONAVEIS_POR_AREA: Record<
  "rematricula" | "engajamento",
  TagAluno[]
> = {
  rematricula: TAGS_REMATRICULA.filter((tag) => tag !== "Nova Matrícula"),
  engajamento: TAGS_ENGAJAMENTO.filter((tag) => tag !== "Nova Matrícula"),
};
