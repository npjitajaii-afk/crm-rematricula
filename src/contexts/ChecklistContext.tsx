import React, { useState, useEffect, ReactNode, useCallback } from "react";
import { ChecklistItem } from "../types";
import {
  getTodosItensChecklist,
  getItensChecklistPorAluno,
  toggleChecklistItem as toggleChecklistItemService,
} from "../services/checklistService";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { ChecklistContext } from "./checklist-context";

interface ChecklistProviderProps {
  children: ReactNode;
}

/** Agrupa a lista plana de itens em um mapa alunoId -> itens (ordenados). */
function agrupar(itens: ChecklistItem[]): Record<string, ChecklistItem[]> {
  const mapa: Record<string, ChecklistItem[]> = {};
  for (const item of itens) {
    if (!mapa[item.alunoId]) mapa[item.alunoId] = [];
    mapa[item.alunoId].push(item);
  }
  Object.values(mapa).forEach((lista) => lista.sort((a, b) => a.ordem - b.ordem));
  return mapa;
}

export const ChecklistProvider: React.FC<ChecklistProviderProps> = ({
  children,
}) => {
  const [itensPorAluno, setItensPorAluno] = useState<Record<string, ChecklistItem[]>>(
    {}
  );
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  // Substitui, dentro do mapa, os itens de UM aluno (usado após um
  // evento de realtime, pra já trazer o nome de quem concluiu via join).
  const resincronizarAluno = useCallback(async (alunoId: string) => {
    const { itens } = await getItensChecklistPorAluno(alunoId);
    if (itens.length === 0) return;
    setItensPorAluno((prev) => ({
      ...prev,
      [alunoId]: [...itens].sort((a, b) => a.ordem - b.ordem),
    }));
  }, []);

  useEffect(() => {
    if (!user) {
      setItensPorAluno({});
      return;
    }

    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      const { itens, error } = await getTodosItensChecklist();
      if (error) {
        console.error("Erro ao carregar checklist de engajamento:", error);
      } else if (isMounted) {
        setItensPorAluno(agrupar(itens));
      }
      setIsLoading(false);
    };

    load();

    // Realtime: um único canal para toda a checklist (não é por aluno,
    // pra não abrir dezenas de canais quando o Kanban tem muitos cards
    // — ver decisão registrada no README-mudancas.md).
    const channel = supabase
      .channel("checklist-engajamento-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "engajamento_checklist_itens" },
        (payload) => {
          const alunoId = (payload.new as { aluno_id: string }).aluno_id;
          resincronizarAluno(alunoId);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "engajamento_checklist_itens" },
        (payload) => {
          const alunoId = (payload.new as { aluno_id: string }).aluno_id;
          resincronizarAluno(alunoId);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user, resincronizarAluno]);

  const toggleItem = async (item: ChecklistItem, concluido: boolean) => {
    if (!user) return;

    // Atualização otimista: o colaborador vê o check marcar na hora,
    // sem esperar a volta do banco/realtime.
    setItensPorAluno((prev) => ({
      ...prev,
      [item.alunoId]: (prev[item.alunoId] || []).map((i) =>
        i.id === item.id
          ? {
              ...i,
              concluido,
              concluidoPor: concluido ? user.id : undefined,
              concluidoPorNome: concluido ? user.name : undefined,
              concluidoEm: concluido ? new Date() : undefined,
            }
          : i
      ),
    }));

    const { error } = await toggleChecklistItemService(item.id, concluido, user.id);
    if (error) {
      console.error("Erro ao atualizar item da checklist:", error);
      // Desfaz a atualização otimista em caso de erro.
      resincronizarAluno(item.alunoId);
    }
  };

  return (
    <ChecklistContext.Provider value={{ itensPorAluno, isLoading, toggleItem }}>
      {children}
    </ChecklistContext.Provider>
  );
};
