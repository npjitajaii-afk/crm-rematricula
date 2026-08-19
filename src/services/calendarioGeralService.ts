import { supabase } from "../lib/supabase";

export interface CalendarioGeralConfig { id: boolean; dia_boleto: number; titulo: string; mensagem: string; numeros_suporte: string; updated_at: string; }
const tabela = (area: "engajamento" | "rematricula") => (area === "rematricula" || window.location.pathname.startsWith("/rematricula/")) ? "rematricula_calendario_geral" : "calendario_geral";
export async function getCalendarioGeral(area: "engajamento" | "rematricula" = "engajamento") {
  const { data, error } = await supabase.from(tabela(area)).select("*").eq("id", true).single();
  return { config: data as CalendarioGeralConfig | null, error: error?.message ?? null };
}
export async function atualizarCalendarioGeral(dados: Pick<CalendarioGeralConfig, "dia_boleto" | "titulo" | "mensagem" | "numeros_suporte">, area: "engajamento" | "rematricula" = "engajamento") {
  const { error } = await supabase.from(tabela(area)).update(dados).eq("id", true);
  return { error: error?.message ?? null };
}
export async function conferirLembreteBoleto() {
  await Promise.all([
    supabase.rpc("disparar_notificacoes_boleto"),
    supabase.rpc("disparar_notificacoes_boleto_rematricula"),
  ]);
}
