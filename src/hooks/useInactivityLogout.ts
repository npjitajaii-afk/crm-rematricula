import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";

/** 1 hora sem clique → encerra a sessão */
const INACTIVITY_MS = 60 * 60 * 1000;

/**
 * Monitora cliques na página. Se passar 1 hora sem interação,
 * faz logout e redireciona para /login com mensagem.
 * Só age quando o usuário está autenticado.
 */
export function useInactivityLogout(): void {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const expire = async () => {
      clearTimer();
      try {
        await logout();
      } catch {
        /* sessão já inválida */
      }
      navigate("/login", {
        replace: true,
        state: {
          message:
            "Sua sessão encerrou por inatividade (1 hora sem interação). Faça login novamente.",
        },
      });
    };

    const reset = () => {
      clearTimer();
      timerRef.current = setTimeout(expire, INACTIVITY_MS);
    };

    // Clique (mouse) e toque — conforme pedido ("interação de clique")
    const events: Array<keyof DocumentEventMap> = ["click", "touchstart"];
    events.forEach((ev) => document.addEventListener(ev, reset, { passive: true }));
    reset(); // inicia o contador ao montar / autenticar

    return () => {
      clearTimer();
      events.forEach((ev) => document.removeEventListener(ev, reset));
    };
  }, [isAuthenticated, logout, navigate]);
}
