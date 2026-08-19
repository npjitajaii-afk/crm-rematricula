import { useContext } from "react";
import { TarefasEngajamentoContextType } from "../types";
import { TarefasEngajamentoContext } from "../contexts/tarefas-engajamento-context";

export const useTarefasEngajamento = (): TarefasEngajamentoContextType => {
  const context = useContext(TarefasEngajamentoContext);
  if (!context) {
    throw new Error(
      "useTarefasEngajamento must be used within a TarefasEngajamentoProvider"
    );
  }
  return context;
};
