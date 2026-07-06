import { createContext } from "react";
import { AlunosContextType } from "../types";

export const AlunosContext = createContext<AlunosContextType | undefined>(
  undefined
);
