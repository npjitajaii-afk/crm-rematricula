import { createContext } from "react";
import { AgendaEngajamentoContextType } from "../types";

export const AgendaEngajamentoContext = createContext<AgendaEngajamentoContextType | undefined>(undefined);
