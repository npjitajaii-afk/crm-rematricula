// supabase/functions/send-email/index.ts
//
// Edge Function para disparo de e-mail via SMTP (Gmail) usando senha de app.
// Agora aceita credenciais POR POLO no body da requisição.
//
// Deploy: supabase functions deploy send-email
//
// Secrets opcionais (fallback global, se o polo não enviar smtpUser/smtpPassword):
//   supabase secrets set GMAIL_USER=seuemail@gmail.com
//   supabase secrets set GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"
//
// Body esperado:
// {
//   "to": "aluno@exemplo.com",
//   "subject": "Sua rematrícula está esperando por você!",
//   "html": "<p>...</p>",
//   "smtpUser": "polo@gmail.com",
//   "smtpPassword": "xxxx xxxx xxxx xxxx",
//   "fromName": "Uniasselvi Itajaí"
// }

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmailPayload {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  /** E-mail SMTP do polo (prioridade sobre o secret global) */
  smtpUser?: string;
  /** Senha de app do polo (prioridade sobre o secret global) */
  smtpPassword?: string;
  /** Nome que aparece como remetente (ex: Uniasselvi Itajaí) */
  fromName?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: EmailPayload = await req.json();

    // Credenciais: prioriza o que veio do polo; senão usa os secrets globais
    const smtpUser =
      payload.smtpUser?.trim() || Deno.env.get("GMAIL_USER") || "";
    const smtpPassword =
      payload.smtpPassword?.trim() || Deno.env.get("GMAIL_APP_PASSWORD") || "";

    if (!smtpUser || !smtpPassword) {
      return new Response(
        JSON.stringify({
          error:
            "Credenciais SMTP não informadas. Envie smtpUser/smtpPassword no body ou configure GMAIL_USER e GMAIL_APP_PASSWORD nos secrets.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!payload.to || !payload.subject || (!payload.html && !payload.text)) {
      return new Response(
        JSON.stringify({
          error: "Campos obrigatórios: 'to', 'subject' e 'html' ou 'text'.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const fromDisplay = payload.fromName
      ? `${payload.fromName} <${smtpUser}>`
      : smtpUser;

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: {
          username: smtpUser,
          password: smtpPassword,
        },
      },
    });

    await client.send({
      from: fromDisplay,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      content: payload.text ?? "Este e-mail requer visualização em HTML.",
      replyTo: payload.replyTo ?? smtpUser,
    });

    await client.close();

    return new Response(
      JSON.stringify({ success: true, message: "E-mail enviado com sucesso." }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Erro ao enviar e-mail:", error);
    return new Response(
      JSON.stringify({
        error: "Falha ao enviar e-mail.",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});