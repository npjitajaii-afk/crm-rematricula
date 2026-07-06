import { useContext } from "react";
import { AlunosContextType } from "../types";
import { AlunosContext } from "../contexts/alunos-context";

export const useAlunos = (): AlunosContextType => {
  const context = useContext(AlunosContext);
  if (!context) {
    throw new Error("useAlunos must be used within an AlunosProvider");
  }
  return context;
};
