import { useContext } from "react";
import {
  TransferenciasPendentesContext,
  TransferenciasPendentesContextType,
} from "../contexts/transferencias-pendentes-context";

export const useTransferenciasPendentes =
  (): TransferenciasPendentesContextType => {
    const context = useContext(TransferenciasPendentesContext);
    if (!context) {
      throw new Error(
        "useTransferenciasPendentes must be used within a TransferenciasPendentesProvider"
      );
    }
    return context;
  };
