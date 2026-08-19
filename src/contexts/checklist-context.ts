import { createContext } from "react";
import { ChecklistContextType } from "../types";

export const ChecklistContext = createContext<ChecklistContextType | undefined>(
  undefined
);
