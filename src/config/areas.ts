// Configuração central das áreas operacionais do CRM.
//
// Cada área (Rematrícula / Retenção / Engajamento) é um funil próprio que
// vive na mesma tabela `alunos`, diferenciado pela coluna `area`. Este
// arquivo é a única fonte de verdade sobre quais status existem em cada
// área, evitando que a lista de colunas do Kanban fique duplicada em vários
// componentes — ver README.md seção 6.
import { Area, AlunoStatus } from "../types";
import { getStatusColor, getStatusLabel } from "../utils/formatters";

export interface AreaConfig {
  label: string;
  /** Status inicial ao criar um aluno diretamente nesta área. */
  statusInicial: AlunoStatus;
  /** Ordem das colunas do Kanban desta área. */
  statuses: AlunoStatus[];
  getColor: (status: AlunoStatus) => string;
  getLabel: (status: AlunoStatus) => string;
}

export const AREA_CONFIG: Record<Area, AreaConfig> = {
  rematricula: {
    label: "Rematrícula",
    statusInicial: "pendente",
    statuses: [
      "cadastrado",
      "pendente",
      "contatado",
      "aguardando_retorno",
      "confirmado",
      "documentacao",
      "aguardando_matricula",
      "matricula_confirmada",
      "rematriculado",
      "desistente",
      "retido",
    ],
    getColor: getStatusColor,
    getLabel: getStatusLabel,
  },
  retencao: {
    label: "Retenção",
    statusInicial: "recebido",
    statuses: [
      "recebido",
      "tentativa_contato",
      "contato_realizado",
      "diagnostico",
      "proposta_enviada",
      "aguardando_decisao",
      "recuperado",
      "perdido",
    ],
    getColor: getStatusColor,
    getLabel: getStatusLabel,
  },
  engajamento: {
    label: "Engajamento",
    statusInicial: "novo_cadastro",
    statuses: [
      "novo_cadastro",
      "primeiro_contato",
      "acompanhamento",
      "engajado",
      "desistente",
      "estabilizado",
    ],
    getColor: getStatusColor,
    getLabel: getStatusLabel,
  },
};

export const AREAS_ORDENADAS: Area[] = ["rematricula", "retencao", "engajamento"];
