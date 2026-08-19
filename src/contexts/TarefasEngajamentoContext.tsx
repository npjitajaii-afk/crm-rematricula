import React, { ReactNode, useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { TarefaPessoal } from "../types";
import { adicionarTarefaChecklistItem, atualizarTarefaPessoal, criarTarefaPessoal, excluirTarefaPessoal, getTarefaPorId, getTarefasPessoais, removerTarefaChecklistItem, TarefasArea, toggleTarefaChecklistItem } from "../services/tarefasEngajamentoService";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { TarefasEngajamentoContext } from "./tarefas-engajamento-context";

export const TarefasEngajamentoProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const area: TarefasArea = pathname.startsWith("/rematricula/") ? "rematricula" : "engajamento";
  const [tarefas, setTarefas] = useState<TarefaPessoal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const load = useCallback(async () => {
    setIsLoading(true);
    const { tarefas: lista, error } = await getTarefasPessoais(area);
    if (error) console.error("Erro ao carregar tarefas:", error); else setTarefas(lista);
    setIsLoading(false);
  }, [area]);
  const resync = useCallback(async (id: string) => {
    const { tarefa } = await getTarefaPorId(id, area);
    if (!tarefa) return load();
    setTarefas((current) => {
      const index = current.findIndex((item) => item.id === id);
      if (index < 0) return [tarefa, ...current];
      const next = [...current]; next[index] = tarefa; return next;
    });
  }, [area, load]);
  useEffect(() => { if (!user) { setTarefas([]); return; } load(); }, [user, load]);
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`tarefas-${area}-realtime`)
      .on("postgres_changes", { event: "*", schema: "public", table: `${area}_tarefas_pessoais` }, (payload) => {
        const id = (payload.new as { id?: string }).id || (payload.old as { id?: string }).id;
        if (id) resync(id); else load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: `${area}_tarefas_checklist` }, (payload) => {
        const id = (payload.new as { tarefa_id?: string }).tarefa_id || (payload.old as { tarefa_id?: string }).tarefa_id;
        if (id) resync(id);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [area, load, resync, user]);
  const criarTarefa = async (dados: { titulo: string; anotacoes?: string; alunoId?: string; prazo?: Date; checklist?: { texto: string }[] }) => {
    if (!user) return; const { tarefa, error } = await criarTarefaPessoal(user.id, dados, area);
    if (error || !tarefa) throw new Error(error || "Erro ao criar tarefa"); setTarefas((current) => [tarefa, ...current]);
  };
  const atualizarTarefa = async (id: string, dados: Partial<{ titulo: string; anotacoes: string; alunoId: string | null; prazo: Date | null; status: "em_andamento" | "concluido" }>) => {
    const { error } = await atualizarTarefaPessoal(id, dados, area); if (error) throw new Error(error); await resync(id);
  };
  const excluirTarefa = async (id: string) => { const { error } = await excluirTarefaPessoal(id, area); if (error) throw new Error(error); setTarefas((current) => current.filter((item) => item.id !== id)); };
  const toggleChecklistItem = async (id: string, concluido: boolean) => { const { error } = await toggleTarefaChecklistItem(id, concluido, area); if (error) throw new Error(error); load(); };
  const adicionarChecklistItem = async (tarefaId: string, texto: string) => { const tarefa = tarefas.find((item) => item.id === tarefaId); const { error } = await adicionarTarefaChecklistItem(tarefaId, texto, tarefa?.checklist.length || 0, area); if (error) throw new Error(error); load(); };
  const removerChecklistItem = async (id: string) => { const { error } = await removerTarefaChecklistItem(id, area); if (error) throw new Error(error); load(); };
  return <TarefasEngajamentoContext.Provider value={{ tarefas, isLoading, criarTarefa, atualizarTarefa, excluirTarefa, toggleChecklistItem, adicionarChecklistItem, removerChecklistItem }}>{children}</TarefasEngajamentoContext.Provider>;
};
