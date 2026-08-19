import React, { ReactNode, useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { AgendaCompromisso } from "../types";
import { AgendaArea, criarCompromissoAgenda, excluirCompromissoAgenda, getCompromissosAgenda } from "../services/agendaEngajamentoService";
import { useAuth } from "../hooks/useAuth";
import { AgendaEngajamentoContext } from "./agenda-engajamento-context";
export const AgendaEngajamentoProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth(); const { pathname } = useLocation();
  const area: AgendaArea = pathname.startsWith("/rematricula/") ? "rematricula" : "engajamento";
  const [compromissos, setCompromissos] = useState<AgendaCompromisso[]>([]); const [isLoading, setIsLoading] = useState(false);
  const carregar = useCallback(async () => { setIsLoading(true); const { compromissos: lista } = await getCompromissosAgenda(area); setCompromissos(lista); setIsLoading(false); }, [area]);
  useEffect(() => { if (!user) { setCompromissos([]); return; } carregar(); }, [user, carregar]);
  const criarCompromisso = async (dados: { alunoId: string; data: Date; ticket?: string; comentario: string }) => { if (!user) return; const { compromisso, error } = await criarCompromissoAgenda(user.id, dados, area); if (error || !compromisso) throw new Error(error || "Erro ao criar agendamento"); setCompromissos((atual) => [...atual, compromisso]); };
  const excluirCompromisso = async (id: string) => { const { error } = await excluirCompromissoAgenda(id, area); if (error) throw new Error(error); setCompromissos((atual) => atual.filter((item) => item.id !== id)); };
  return <AgendaEngajamentoContext.Provider value={{ compromissos, isLoading, criarCompromisso, excluirCompromisso }}>{children}</AgendaEngajamentoContext.Provider>;
};
