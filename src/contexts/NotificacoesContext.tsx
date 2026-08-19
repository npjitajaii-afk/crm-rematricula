import React, { useState, useEffect, useMemo, ReactNode } from "react";
import { Notificacao } from "../types";
import {
  getNotificacoes,
  marcarComoLida as marcarComoLidaService,
  marcarTodasComoLidas as marcarTodasComoLidasService,
  enviarRecado as enviarRecadoService,
  mapNotificacaoRow,
} from "../services/notificacoesService";
import { conferirLembreteBoleto } from "../services/calendarioGeralService";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { NotificacoesContext } from "./notificacoes-context";

interface NotificacoesProviderProps {
  children: ReactNode;
}

export const NotificacoesProvider: React.FC<NotificacoesProviderProps> = ({
  children,
}) => {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setNotificacoes([]);
      return;
    }

    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      const { data, error } = await getNotificacoes();
      if (error) {
        console.error("Erro ao carregar notificações:", error);
      } else if (isMounted) {
        setNotificacoes(data);
      }
      setIsLoading(false);
    };

    load();
    // Garante o aviso recorrente mesmo se o agendador do banco ainda nÃ£o
    // tiver rodado; a funÃ§Ã£o no banco evita notificaÃ§Ãµes duplicadas.
    conferirLembreteBoleto();
    const lembreteIntervalo = window.setInterval(
      () => conferirLembreteBoleto(),
      60 * 60 * 1000
    );

    // Realtime: recebe notificações novas assim que os triggers do banco
    // (mudança de status, nova interação) ou um recado do admin as criam,
    // sem precisar recarregar a página.
    const channel = supabase
      .channel(`notificacoes-realtime-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificacoes",
          filter: `para_user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotificacoes((prev) => [
            mapNotificacaoRow(payload.new),
            ...prev,
          ]);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      window.clearInterval(lembreteIntervalo);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const naoLidas = useMemo(
    () => notificacoes.filter((n) => !n.lida).length,
    [notificacoes]
  );

  const marcarLida = async (id: string) => {
    setNotificacoes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, lida: true } : n))
    );

    const { error } = await marcarComoLidaService(id);
    if (error) {
      console.error("Erro ao marcar notificação como lida:", error);
    }
  };

  const marcarTodasLidas = async () => {
    setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));

    const { error } = await marcarTodasComoLidasService();
    if (error) {
      console.error("Erro ao marcar notificações como lidas:", error);
    }
  };

  const enviarRecado = async (
    paraUserId: string,
    titulo: string,
    corpo: string
  ) => {
    const { error } = await enviarRecadoService(paraUserId, titulo, corpo);
    if (error) {
      throw new Error(error);
    }
  };

  return (
    <NotificacoesContext.Provider
      value={{
        notificacoes,
        naoLidas,
        isLoading,
        marcarLida,
        marcarTodasLidas,
        enviarRecado,
      }}
    >
      {children}
    </NotificacoesContext.Provider>
  );
};
