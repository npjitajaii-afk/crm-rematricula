import { createContext } from "react";
import { TarefasEngajamentoContextType } from "../types";

export const TarefasEngajamentoContext = createContext<
  TarefasEngajamentoContextType | undefined
>(undefined);
