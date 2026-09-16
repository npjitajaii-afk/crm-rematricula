import { createContext } from "react";
import { SolicitacaoTransferencia } from "../types";

export interface TransferenciasPendentesContextType {
  /** Todas as solicitações pendentes visíveis para o usuário logado. */
  pendentes: SolicitacaoTransferencia[];
  /** Quantidade total de pendentes (para badge da aba Transferências). */
  totalPendentes: number;
  /** Quantidade aguardando decisão do gestor (supervisor/admin). */
  totalAguardandoGestor: number;
  /** IDs de alunos com qualquer solicitação pendente. */
  alunoIdsComPendente: Set<string>;
  /**
   * IDs de alunos em que o usuário logado é o responsável de origem
   * e a solicitação está em `aguardando_responsavel` (pedido de outro
   * colaborador para assumir o contato).
   */
  alunoIdsAguardandoMinhaAutorizacao: Set<string>;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export const TransferenciasPendentesContext = createContext<
  TransferenciasPendentesContextType | undefined
>(undefined);
