import React, { useState, useEffect, ReactNode, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { WhatsappResumo } from "../types";
import {
  getResumoWhatsappTodosAlunos,
  getResumoWhatsappPorAluno,
  marcarMensagensComoLidas as marcarMensagensComoLidasService,
} from "../services/whatsappService";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { WhatsappContext } from "./whatsapp-context";

interface WhatsappProviderProps {
  children: ReactNode;
}

/**
 * Prepara o app para receber, em tempo real, as mensagens de WhatsApp
 * que chegam via webhook da Evolution API (Edge Function
 * supabase/functions/evolution-webhook, que grava em
 * public.whatsapp_mensagens — ver database/010_whatsapp_evolution.sql).
 *
 * Mantém um resumo (não lidas + última mensagem) por aluno, exibido
 * como badge no AlunoCard do Kanban.
 */
export const WhatsappProvider: React.FC<WhatsappProviderProps> = ({
  children,
}) => {
  const [resumoPorAluno, setResumoPorAluno] = useState<Record<string, WhatsappResumo>>(
    {}
  );
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { pathname } = useLocation();
  // Badges de WhatsApp aparecem nos cards do Kanban (todas as áreas de funil).
  // Fora dessas rotas não precisamos do resumo em massa nem do canal realtime.
  const precisaWhatsapp =
    pathname.startsWith("/alunos") ||
    pathname.startsWith("/meus-contatos") ||
    pathname.startsWith("/engajamento") ||
    pathname.startsWith("/retencao") ||
    pathname.startsWith("/risco-evasao") ||
    pathname.startsWith("/rematricula");

  const resincronizarAluno = useCallback(async (alunoId: string) => {
    const { resumo } = await getResumoWhatsappPorAluno(alunoId);
    if (!resumo) return;
    setResumoPorAluno((prev) => ({ ...prev, [alunoId]: resumo }));
  }, []);

  useEffect(() => {
    if (!user) {
      setResumoPorAluno({});
      return;
    }

    // Fora das telas de funil: não carrega resumo em massa nem realtime.
    // O resumo de um aluno específico ainda pode ser buscado sob demanda
    // via resincronizarAluno se algum componente chamar.
    if (!precisaWhatsapp) {
      return;
    }

    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      const { resumoPorAluno: resumo, error } = await getResumoWhatsappTodosAlunos();
      if (error) {
        console.error("Erro ao carregar resumo de whatsapp:", error);
      } else if (isMounted) {
        setResumoPorAluno(resumo);
      }
      setIsLoading(false);
    };

    // Atrasa um pouco a carga em massa pro getAlunos (lista leve) ganhar
    // a disputa de rede logo após o login / troca de funil.
    const defer = window.setTimeout(() => {
      if (isMounted) load();
    }, 400);

    // Um único canal de realtime para toda a base — cada mensagem nova
    // (INSERT) ou marcação de lida (UPDATE) só re-sincroniza o resumo
    // do aluno afetado, sem recarregar tudo nem abrir um canal por card.
    const channel = supabase
      .channel("whatsapp-mensagens-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_mensagens" },
        (payload) => {
          const alunoId = (payload.new as { aluno_id: string | null }).aluno_id;
          if (alunoId) resincronizarAluno(alunoId);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_mensagens" },
        (payload) => {
          const alunoId = (payload.new as { aluno_id: string | null }).aluno_id;
          if (alunoId) resincronizarAluno(alunoId);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      window.clearTimeout(defer);
      supabase.removeChannel(channel);
    };
  }, [user?.id, resincronizarAluno, precisaWhatsapp]);

  const marcarComoLida = async (alunoId: string) => {
    // Otimista: zera o badge na hora, o colaborador já abriu o card/tela.
    setResumoPorAluno((prev) =>
      prev[alunoId] ? { ...prev, [alunoId]: { ...prev[alunoId], naoLidas: 0 } } : prev
    );

    const { error } = await marcarMensagensComoLidasService(alunoId);
    if (error) {
      console.error("Erro ao marcar mensagens de whatsapp como lidas:", error);
      resincronizarAluno(alunoId);
    }
  };

  return (
    <WhatsappContext.Provider value={{ resumoPorAluno, isLoading, marcarComoLida }}>
      {children}
    </WhatsappContext.Provider>
  );
};
