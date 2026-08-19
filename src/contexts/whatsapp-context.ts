import { createContext } from "react";
import { WhatsappContextType } from "../types";

export const WhatsappContext = createContext<WhatsappContextType | undefined>(
  undefined
);
