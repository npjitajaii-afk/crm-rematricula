import React from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { ToastMessage, ToastType } from "../types";
import "./ToastContainer.css";

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const icons: Record<ToastType, React.ElementType> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onDismiss,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = icons[toast.type];
        return (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <Icon size={18} />
            <span>{toast.message}</span>
            <button
              className="toast-close"
              onClick={() => onDismiss(toast.id)}
              aria-label="Fechar notificação"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ToastContainer;