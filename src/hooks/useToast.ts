import { useContext } from "react";
import { ToastContextType } from "../types";
import { ToastContext } from "../contexts/toast-context";

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};