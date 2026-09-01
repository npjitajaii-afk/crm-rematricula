import React, { useState, useEffect, ReactNode, useCallback, useRef } from "react";
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

// Total de itens definido pela trigger de seed (ver
// database/009_checklist_engajamento.sql). Um aluno só é considerado
// "carregado" quando o número de itens retornado bate com isso — não
// basta ter vindo alguma coisa, senão um aluno pego pela busca em massa
// no meio da inserção (ex: 1 de 7 itens) nunca mais tenta buscar o resto.
const TOTAL_ITENS_CHECKLIST = 7;
// Limite de tentativas de busca individual por aluno, pra não martelar
// o banco indefinidamente caso um aluno realmente fique com menos de 7
// itens por algum motivo legítimo (edição manual, etc).
const MAX_TENTATIVAS_CARREGAMENTO = 4;

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
  // Estado de carregamento por aluno: `completo` só vira true quando
  // vieram os 7 itens; `tentativas` limita quantas vezes
  // `garantirItensCarregados` tenta buscar de novo enquanto parcial.
  const statusCarregamentoRef = useRef<
    Map<string, { completo: boolean; tentativas: number }>
  >(new Map());

  // Substitui, dentro do mapa, os itens de UM aluno (usado após um
  // evento de realtime, pra já trazer o nome de quem concluiu via join,
  // e também na busca ativa de garantirItensCarregados).
  const resincronizarAluno = useCallback(async (alunoId: string) => {
    const { itens } = await getItensChecklistPorAluno(alunoId);
    const anterior = statusCarregamentoRef.current.get(alunoId);
    statusCarregamentoRef.current.set(alunoId, {
      completo: itens.length >= TOTAL_ITENS_CHECKLIST,
      tentativas: (anterior?.tentativas ?? 0) + 1,
    });
    if (itens.length === 0) return;
    setItensPorAluno((prev) => ({
      ...prev,
      [alunoId]: [...itens].sort((a, b) => a.ordem - b.ordem),
    }));
  }, []);

  // Busca ativa: chamada por quem renderiza o card/modal de um aluno de
  // Engajamento. O carregamento inicial (`load`, abaixo) e o realtime só
  // enxergam linhas que já existiam/mudaram durante esta sessão — se a
  // checklist do aluno foi criada pelo banco um instante antes ou depois
  // do carregamento inicial, ela nunca chega sozinha, e o único jeito de
  // aparecer era o usuário mexer numa tarefa (o que força um resync via
  // realtime). Isso resolve sem precisar desse gatilho manual.
  //
  // Enquanto o aluno não estiver com os 7 itens completos, segue
  // tentando buscar de novo (até MAX_TENTATIVAS_CARREGAMENTO), em vez de
  // desistir na primeira resposta parcial.
  const garantirItensCarregados = useCallback(
    (alunoId: string) => {
      const status = statusCarregamentoRef.current.get(alunoId);
      if (status?.completo) return;
      if (status && status.tentativas >= MAX_TENTATIVAS_CARREGAMENTO) return;
      resincronizarAluno(alunoId);
    },
    [resincronizarAluno]
  );

  useEffect(() => {
    if (!user) {
      setItensPorAluno({});
      statusCarregamentoRef.current.clear();
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
        // Marca "completo" só quem já veio com os 7 itens na busca em
        // massa. Quem veio parcial (ou não veio) continua elegível pra
        // garantirItensCarregados tentar de novo.
        const contagemPorAluno = new Map<string, number>();
        for (const item of itens) {
          contagemPorAluno.set(item.alunoId, (contagemPorAluno.get(item.alunoId) ?? 0) + 1);
        }
        contagemPorAluno.forEach((quantidade, alunoId) => {
          statusCarregamentoRef.current.set(alunoId, {
            completo: quantidade >= TOTAL_ITENS_CHECKLIST,
            tentativas: 0,
          });
        });
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
    <ChecklistContext.Provider
      value={{ itensPorAluno, isLoading, toggleItem, garantirItensCarregados }}
    >
      {children}
    </ChecklistContext.Provider>
  );
};