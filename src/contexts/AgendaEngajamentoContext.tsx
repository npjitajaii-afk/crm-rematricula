import React, { ReactNode, useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { AgendaCompromisso } from "../types";
import {
  AgendaArea,
  criarCompromissoAgenda,
  excluirCompromissoAgenda,
  getCompromissosAgenda,
} from "../services/agendaEngajamentoService";
import { useAuth } from "../hooks/useAuth";
import { AgendaEngajamentoContext } from "./agenda-engajamento-context";

export const AgendaEngajamentoProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  // Mesma regra de TarefasEngajamentoContext: rotas principais da
  // Rematrícula não usam o prefixo /rematricula/.
  const area: AgendaArea =
    pathname.startsWith("/rematricula") ||
    pathname.startsWith("/alunos") ||
    pathname.startsWith("/meus-contatos") ||
    pathname.startsWith("/risco-evasao")
      ? "rematricula"
      : "engajamento";
  const [compromissos, setCompromissos] = useState<AgendaCompromisso[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Só carrega agenda nas rotas que realmente usam essas telas.
  const precisaAgenda =
    pathname.includes("/agenda") ||
    pathname.includes("/calendario") ||
    pathname.includes("/tarefas") ||
    pathname.includes("/painel-tarefas");

  const carregar = useCallback(async () => {
    if (!user?.id) {
      setCompromissos([]);
      return;
    }
    setIsLoading(true);
    // Isolamento por usuário: cada um vê só a própria agenda.
    const { compromissos: lista, error } = await getCompromissosAgenda(
      area,
      user.id
    );
    if (error) {
      console.error("Erro ao carregar agenda:", error);
      setCompromissos([]);
    } else {
      setCompromissos(lista);
    }
    setIsLoading(false);
  }, [area, user?.id]);

  useEffect(() => {
    if (!user) {
      setCompromissos([]);
      return;
    }
    if (!precisaAgenda) return;
    carregar();
  }, [user, carregar, precisaAgenda]);

  const criarCompromisso = async (dados: {
    alunoId: string;
    data: Date;
    ticket?: string;
    comentario: string;
  }) => {
    if (!user) return;
    const { compromisso, error } = await criarCompromissoAgenda(
      user.id,
      dados,
      area
    );
    if (error || !compromisso)
      throw new Error(error || "Erro ao criar agendamento");
    setCompromissos((atual) => [...atual, compromisso]);
  };

  const excluirCompromisso = async (id: string) => {
    if (!user) return;
    // Só permite excluir o próprio compromisso.
    const { error } = await excluirCompromissoAgenda(id, area, user.id);
    if (error) throw new Error(error);
    setCompromissos((atual) => atual.filter((item) => item.id !== id));
  };

  return (
    <AgendaEngajamentoContext.Provider
      value={{ compromissos, isLoading, criarCompromisso, excluirCompromisso }}
    >
      {children}
    </AgendaEngajamentoContext.Provider>
  );
};
