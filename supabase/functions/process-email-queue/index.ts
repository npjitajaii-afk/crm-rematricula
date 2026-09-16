// supabase/functions/process-email-queue/index.ts
//
// Processa a fila de e-mails de rematrícula:
// - Lotes de 100 por polo
// - Limite 500/dia por polo (Gmail)
// - Quando a cota acaba (ou não sobra ninguém):
//     → envia 1 relatório dos não enviados para o e-mail do polo
//     → DELETE de tudo da fila daquele polo (nada fica no banco)
//
// Deploy:
//   supabase functions deploy process-email-queue
//
// Cron (Dashboard → Edge Functions → Cron):
//   Schedule: */5 * * * *
//   Method:   POST
//   Header:   Authorization: Bearer <SERVICE_ROLE_KEY>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LIMITE_DIARIO = 500;
const LOTE = 100;
const DELAY_ENTRE_ENVIOS_MS = 300;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "SUPABASE_URL ou SERVICE_ROLE_KEY ausentes." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Polos que têm itens na fila (qualquer status ainda presente)
    const { data: rowsPolo, error: errPolos } = await supabase
      .from("email_fila")
      .select("polo_id");

    if (errPolos) throw errPolos;

    const poloIds = [...new Set((rowsPolo ?? []).map((r) => r.polo_id))];
    const resumo: Record<
      string,
      {
        nome: string;
        enviadosNesteCiclo: number;
        falhasNesteCiclo: number;
        cotaRestanteAntes: number;
        relatorioEnviado: boolean;
        registrosApagados: number;
      }
    > = {};

    for (const poloId of poloIds) {
      // Dados do polo (SMTP + nome)
      const { data: polo, error: errPolo } = await supabase
        .from("polos")
        .select("id, nome, email_remetente, senha_app")
        .eq("id", poloId)
        .single();

      if (errPolo || !polo?.email_remetente || !polo?.senha_app) {
        console.warn(`Polo ${poloId} sem SMTP configurado — pulando.`);
        continue;
      }

      const nomePolo = polo.nome ?? poloId;

      // Quantos já foram enviados hoje
      const { data: enviadosHoje, error: errCount } = await supabase.rpc(
        "email_envios_hoje",
        { p_polo_id: poloId },
      );
      if (errCount) throw errCount;

      const jaEnviados = Number(enviadosHoje ?? 0);
      const restante = Math.max(0, LIMITE_DIARIO - jaEnviados);
      const pegar = Math.min(LOTE, restante);

      resumo[poloId] = {
        nome: nomePolo,
        enviadosNesteCiclo: 0,
        falhasNesteCiclo: 0,
        cotaRestanteAntes: restante,
        relatorioEnviado: false,
        registrosApagados: 0,
      };

      // ----- 1) Processa lote se ainda houver cota -----
      if (pegar > 0) {
        const { data: lote, error: errLote } = await supabase.rpc(
          "email_fila_proximo_lote",
          {
            p_polo_id: poloId,
            p_tamanho: pegar,
            p_limite_diario: LIMITE_DIARIO,
          },
        );
        if (errLote) throw errLote;

        if (lote?.length) {
          const client = new SMTPClient({
            connection: {
              hostname: "smtp.gmail.com",
              port: 465,
              tls: true,
              auth: {
                username: polo.email_remetente,
                password: polo.senha_app,
              },
            },
          });

          for (const item of lote) {
            try {
              await client.send({
                from: `Uniasselvi ${nomePolo} <${polo.email_remetente}>`,
                to: item.destinatario,
                subject: item.assunto,
                html: item.html,
                content: "Este e-mail requer visualização em HTML.",
                replyTo: polo.email_remetente,
              });

              await supabase
                .from("email_fila")
                .update({
                  status: "sent",
                  enviado_em: new Date().toISOString(),
                  erro: null,
                })
                .eq("id", item.id);

              resumo[poloId].enviadosNesteCiclo++;
              await delay(DELAY_ENTRE_ENVIOS_MS);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              const novoStatus =
                (item.tentativas ?? 1) >= (item.max_tentativas ?? 3)
                  ? "failed"
                  : "pending";

              await supabase
                .from("email_fila")
                .update({
                  status: novoStatus,
                  erro: msg,
                })
                .eq("id", item.id);

              resumo[poloId].falhasNesteCiclo++;
              console.error(`Falha envio ${item.id} (${item.destinatario}):`, msg);
            }
          }

          await client.close();
        }
      } else {
        console.log(
          `Polo ${nomePolo}: cota diária esgotada (${jaEnviados}/${LIMITE_DIARIO}).`,
        );
      }

      // ----- 2) Decide se fecha o workflow deste polo -----
      // Recalcula cota e quantos ainda não foram enviados
      const { data: enviadosAgora } = await supabase.rpc("email_envios_hoje", {
        p_polo_id: poloId,
      });
      const totalEnviadosHoje = Number(enviadosAgora ?? 0);
      const cotaEsgotada = totalEnviadosHoje >= LIMITE_DIARIO;

      const { count: qtdNaoEnviados } = await supabase
        .from("email_fila")
        .select("*", { count: "exact", head: true })
        .eq("polo_id", poloId)
        .in("status", ["pending", "failed", "processing"]);

      const temNaoEnviados = (qtdNaoEnviados ?? 0) > 0;
      const filaVaziaDePendentes = !temNaoEnviados;

      // Fecha quando:
      //  a) cota esgotou E ainda há não-enviados  → relatório + limpa
      //  b) não sobrou ninguém pendente/failed     → só limpa (sucesso total)
      const deveFechar = (cotaEsgotada && temNaoEnviados) || filaVaziaDePendentes;

      if (!deveFechar) {
        // Ainda há cota e ainda há pending → deixa pro próximo ciclo do cron
        continue;
      }

      // ----- 3) Relatório dos não enviados (se houver) -----
      if (temNaoEnviados) {
        const { data: naoEnviados, error: errNao } = await supabase.rpc(
          "email_fila_itens_nao_enviados",
          { p_polo_id: poloId },
        );
        if (errNao) throw errNao;

        const lista = naoEnviados ?? [];
        const linhas = lista
          .map(
            (r: {
              destinatario: string;
              status: string;
              erro: string | null;
              criado_em: string;
            }, i: number) => `
            <tr>
              <td style="padding:6px 10px;border:1px solid #ddd;">${i + 1}</td>
              <td style="padding:6px 10px;border:1px solid #ddd;">${escapeHtml(r.destinatario)}</td>
              <td style="padding:6px 10px;border:1px solid #ddd;">${escapeHtml(r.status)}</td>
              <td style="padding:6px 10px;border:1px solid #ddd;">${escapeHtml(r.erro ?? "—")}</td>
              <td style="padding:6px 10px;border:1px solid #ddd;">${r.criado_em ?? ""}</td>
            </tr>`,
          )
          .join("");

        const htmlRelatorio = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#333;padding:24px;">
  <h2 style="margin:0 0 12px 0;">Relatório de e-mails não enviados</h2>
  <p style="margin:0 0 8px 0;"><strong>Polo:</strong> ${escapeHtml(nomePolo)}</p>
  <p style="margin:0 0 8px 0;"><strong>Total não enviados:</strong> ${lista.length}</p>
  <p style="margin:0 0 20px 0;color:#666;font-size:14px;">
    Limite diário de ${LIMITE_DIARIO} atingido ou itens com falha.
    Estes registros serão removidos da fila após este e-mail.
  </p>
  <table style="border-collapse:collapse;font-size:13px;width:100%;max-width:900px;">
    <thead>
      <tr style="background:#0f2744;color:#fff;">
        <th style="padding:8px;border:1px solid #ddd;text-align:left;">#</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:left;">E-mail</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:left;">Status</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:left;">Erro</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:left;">Enfileirado em</th>
      </tr>
    </thead>
    <tbody>
      ${linhas}
    </tbody>
  </table>
</body>
</html>`;

        const clientRel = new SMTPClient({
          connection: {
            hostname: "smtp.gmail.com",
            port: 465,
            tls: true,
            auth: {
              username: polo.email_remetente,
              password: polo.senha_app,
            },
          },
        });

        await clientRel.send({
          from: `Uniasselvi ${nomePolo} <${polo.email_remetente}>`,
          to: polo.email_remetente,
          subject: `[Rematrícula] Relatório de e-mails não enviados — ${nomePolo} (${lista.length})`,
          html: htmlRelatorio,
          content: "Relatório de e-mails não enviados da fila de rematrícula.",
          replyTo: polo.email_remetente,
        });
        await clientRel.close();

        resumo[poloId].relatorioEnviado = true;
        console.log(
          `Polo ${nomePolo}: relatório de ${lista.length} não enviados → ${polo.email_remetente}`,
        );
      }

      // ----- 4) Apaga TUDO da fila deste polo -----
      const { data: apagados, error: errLimpa } = await supabase.rpc(
        "email_fila_limpar_polo",
        { p_polo_id: poloId },
      );
      if (errLimpa) throw errLimpa;

      resumo[poloId].registrosApagados = Number(apagados ?? 0);
      console.log(
        `Polo ${nomePolo}: fila limpa (${resumo[poloId].registrosApagados} registros).`,
      );
    }

    return new Response(JSON.stringify({ success: true, resumo }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({
        error: "Falha ao processar fila",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}