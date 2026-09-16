import { supabase } from "../lib/supabase";
import { Area, AuditoriaEvento, AuditoriaEventoTipo, AuditoriaFiltros } from "../types";

function mapRow(row: Record<string, unknown>): AuditoriaEvento {
  return {
    id: row.id as string,
    alunoId: (row.aluno_id as string) || undefined,
    alunoNome: (row.aluno_nome as string) || undefined,
    poloId: (row.polo_id as string) || undefined,
    area: (row.area as Area) || undefined,
    tipo: row.tipo as AuditoriaEventoTipo,
    payload: (row.payload as Record<string, unknown>) || {},
    actorId: (row.actor_id as string) || undefined,
    actorNome: (row.actor_nome as string) || undefined,
    createdAt: row.created_at as string,
  };
}

export interface ListarAuditoriaOptions {
  filtros?: AuditoriaFiltros;
  limit?: number;
  offset?: number;
}

/**
 * Lista eventos de auditoria (só admin/supervisor via RLS).
 * Ordenação: mais recentes primeiro.
 */
export async function listarAuditoriaEventos(
  options: ListarAuditoriaOptions = {}
): Promise<{ eventos: AuditoriaEvento[]; error: string | null }> {
  try {
    const { filtros = {}, limit = 50, offset = 0 } = options;

    let query = supabase
      .from("auditoria_eventos")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (filtros.tipo) {
      query = query.eq("tipo", filtros.tipo);
    }
    if (filtros.area) {
      query = query.eq("area", filtros.area);
    }
    if (filtros.actorId) {
      query = query.eq("actor_id", filtros.actorId);
    }
    if (filtros.poloId) {
      query = query.eq("polo_id", filtros.poloId);
    }
    if (filtros.dateFrom) {
      query = query.gte("created_at", `${filtros.dateFrom}T00:00:00`);
    }
    if (filtros.dateTo) {
      query = query.lte("created_at", `${filtros.dateTo}T23:59:59.999`);
    }
    if (filtros.search?.trim()) {
      const termo = filtros.search.trim();
      query = query.ilike("aluno_nome", `%${termo}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Erro ao listar auditoria:", error);
      return { eventos: [], error: error.message };
    }

    return {
      eventos: (data || []).map((row) => mapRow(row as Record<string, unknown>)),
      error: null,
    };
  } catch (err) {
    console.error("Erro ao listar auditoria:", err);
    return { eventos: [], error: "Erro ao carregar relatório de auditoria" };
  }
}

/**
 * Inscreve em novos eventos de auditoria (tempo real).
 * Retorna função de cleanup (removeChannel).
 */
export function subscribeAuditoriaEventos(
  onInsert: (evento: AuditoriaEvento) => void
): () => void {
  const channel = supabase
    .channel("auditoria-relatorio")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "auditoria_eventos",
      },
      (payload) => {
        if (payload.new) {
          onInsert(mapRow(payload.new as Record<string, unknown>));
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Exporta eventos filtrados (até maxRows) para planilha XLSX no browser.
 */
export async function exportarAuditoriaEventos(
  filtros: AuditoriaFiltros = {},
  maxRows = 5000
): Promise<{ count: number; error: string | null }> {
  try {
    const { eventos, error } = await listarAuditoriaEventos({
      filtros,
      limit: maxRows,
      offset: 0,
    });
    if (error) return { count: 0, error };

    const AREA_LABEL: Record<string, string> = {
      rematricula: "Rematrícula",
      engajamento: "Engajamento",
      retencao: "Retenção",
    };
    const TIPO_LABEL: Record<string, string> = {
      criacao: "Criação",
      status: "Status",
      transferencia: "Transferência",
    };

    const rows = eventos.map((ev) => {
      const p = ev.payload || {};
      let detalhe = "";
      if (ev.tipo === "criacao") {
        detalhe = `Status inicial: ${p.status_inicial ?? "—"}${
          p.ra ? ` · RA ${p.ra}` : ""
        }`;
      } else if (ev.tipo === "status") {
        detalhe = `${p.status_de ?? "?"} → ${p.status_para ?? "?"}`;
      } else if (ev.tipo === "transferencia") {
        const partes: string[] = [];
        if (p.tipo_solicitacao === "assumir_responsabilidade") {
          partes.push("Assumir responsabilidade");
        } else if (p.tipo_solicitacao === "mudanca_setor") {
          partes.push("Mudança de setor");
        }
        if (p.setor_origem_nome || p.setor_destino_nome) {
          partes.push(
            `Setor: ${p.setor_origem_nome ?? "—"} → ${p.setor_destino_nome ?? "—"}`
          );
        }
        if (p.responsavel_origem_nome || p.colaborador_destino_nome) {
          partes.push(
            `Resp.: ${p.responsavel_origem_nome ?? "—"} → ${
              p.colaborador_destino_nome ?? "—"
            }`
          );
        }
        if (p.solicitante_nome) {
          partes.push(`Solicitante: ${p.solicitante_nome}`);
        }
        if (p.motivo) partes.push(String(p.motivo));
        detalhe = partes.join(" · ") || "Transferência";
      }

      return {
        "Data/Hora": ev.createdAt
          ? new Date(ev.createdAt).toLocaleString("pt-BR")
          : "",
        Tipo: TIPO_LABEL[ev.tipo] || ev.tipo,
        Aluno: ev.alunoNome || "",
        Funil: ev.area ? AREA_LABEL[ev.area] || ev.area : "",
        Detalhe: detalhe,
        Usuário: ev.actorNome || "",
        "Aluno ID": ev.alunoId || "",
        "Polo ID": ev.poloId || "",
      };
    });

    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Relatorio");
    const fileName = `relatorio-auditoria-${
      new Date().toISOString().split("T")[0]
    }.xlsx`;
    XLSX.writeFile(workbook, fileName);
    return { count: rows.length, error: null };
  } catch (err) {
    console.error("Erro ao exportar auditoria:", err);
    return { count: 0, error: "Erro ao exportar planilha" };
  }
}
