import { createContext } from "react";
import { ConfirmContextType } from "../types";

export const ConfirmContext = createContext<ConfirmContextType | undefined>(
  undefined
);
