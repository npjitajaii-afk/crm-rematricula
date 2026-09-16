import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  ReactNode,
} from "react";
import { SolicitacaoTransferencia } from "../types";
import { listarSolicitacoesTransferencia } from "../services/transferenciasService";
import { useAuth } from "../hooks/useAuth";
import { TransferenciasPendentesContext } from "./transferencias-pendentes-context";

interface TransferenciasPendentesProviderProps {
  children: ReactNode;
}

/**
 * Carrega solicitações de transferência pendentes e expõe mapas/contagens
 * para badges no menu, destaque nos cards e na aba de Transferência do modal.
 *
 * Usa apenas RPCs já existentes (033_solicitacoes_transferencia.sql).
 * Sem alteração de schema.
 */
export const TransferenciasPendentesProvider: React.FC<
  TransferenciasPendentesProviderProps
> = ({ children }) => {
  const [pendentes, setPendentes] = useState<SolicitacaoTransferencia[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  const refresh = useCallback(async () => {
    if (!user) {
      setPendentes([]);
      return;
    }
    setIsLoading(true);
    try {
      const { solicitacoes, error } = await listarSolicitacoesTransferencia(
        true
      );
      if (error) {
        // Silencioso: a tela de Transferências mostra o erro se o usuário abrir.
        console.warn("Erro ao carregar transferências pendentes:", error);
        setPendentes([]);
      } else {
        setPendentes(solicitacoes);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setPendentes([]);
      return;
    }

    let mounted = true;
    const load = async () => {
      if (!mounted) return;
      await refresh();
    };
    load();

    // Atualiza a cada 45s para o badge/destaque não ficar stale sem realtime.
    const interval = window.setInterval(() => {
      if (mounted) refresh();
    }, 45_000);

    // Atualiza ao voltar para a aba do browser.
    const onFocus = () => {
      if (mounted) refresh();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, refresh]);

  const value = useMemo(() => {
    const alunoIdsComPendente = new Set<string>();
    const alunoIdsAguardandoMinhaAutorizacao = new Set<string>();
    let totalAguardandoGestor = 0;

    for (const s of pendentes) {
      alunoIdsComPendente.add(s.alunoId);
      if (s.status === "aguardando_gestor") {
        totalAguardandoGestor += 1;
      }
      if (
        s.status === "aguardando_responsavel" &&
        user &&
        s.responsavelOrigemId === user.id
      ) {
        alunoIdsAguardandoMinhaAutorizacao.add(s.alunoId);
      }
    }

    return {
      pendentes,
      totalPendentes: pendentes.length,
      totalAguardandoGestor,
      alunoIdsComPendente,
      alunoIdsAguardandoMinhaAutorizacao,
      isLoading,
      refresh,
    };
  }, [pendentes, isLoading, refresh, user]);

  return (
    <TransferenciasPendentesContext.Provider value={value}>
      {children}
    </TransferenciasPendentesContext.Provider>
  );
};
