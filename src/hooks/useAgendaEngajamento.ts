import { useContext } from "react";
import { AgendaEngajamentoContextType } from "../types";
import { AgendaEngajamentoContext } from "../contexts/agenda-engajamento-context";

export const useAgendaEngajamento = (): AgendaEngajamentoContextType => {
  const context = useContext(AgendaEngajamentoContext);
  if (!context) throw new Error("useAgendaEngajamento must be used within an AgendaEngajamentoProvider");
  return context;
};
