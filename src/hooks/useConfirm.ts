import { useContext } from "react";
import { ConfirmContextType } from "../types";
import { ConfirmContext } from "../contexts/confirm-context";

export const useConfirm = (): ConfirmContextType => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context;
};
