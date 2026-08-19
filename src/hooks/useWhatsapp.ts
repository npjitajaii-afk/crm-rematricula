import { useContext } from "react";
import { WhatsappContextType } from "../types";
import { WhatsappContext } from "../contexts/whatsapp-context";

export const useWhatsapp = (): WhatsappContextType => {
  const context = useContext(WhatsappContext);
  if (!context) {
    throw new Error("useWhatsapp must be used within a WhatsappProvider");
  }
  return context;
};
