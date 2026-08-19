import { useContext } from "react";
import { NotificacoesContextType } from "../types";
import { NotificacoesContext } from "../contexts/notificacoes-context";

export const useNotificacoes = (): NotificacoesContextType => {
  const context = useContext(NotificacoesContext);
  if (!context) {
    throw new Error(
      "useNotificacoes must be used within a NotificacoesProvider"
    );
  }
  return context;
};
