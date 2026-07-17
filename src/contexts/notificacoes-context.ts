import { createContext } from "react";
import { NotificacoesContextType } from "../types";

export const NotificacoesContext = createContext<
  NotificacoesContextType | undefined
>(undefined);
