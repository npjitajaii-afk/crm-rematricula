import React from "react";
import { WhatsappResumo } from "../../types";
import { MessageCircle } from "lucide-react";
import "./WhatsappBadge.css";

interface WhatsappBadgeProps {
  resumo: WhatsappResumo;
}

/**
 * Indicador de mensagens de WhatsApp no card do Kanban, alimentado pelas
 * mensagens que chegam via webhook da Evolution API (ver
 * database/010_whatsapp_evolution.sql e
 * supabase/functions/evolution-webhook). Mostra a contagem de não lidas
 * e um preview da última mensagem.
 */
const WhatsappBadge: React.FC<WhatsappBadgeProps> = ({ resumo }) => {
  if (!resumo.ultimaMensagem && resumo.naoLidas === 0) return null;

  const temNaoLidas = resumo.naoLidas > 0;

  return (
    <div
      className={`whatsapp-badge${temNaoLidas ? " whatsapp-badge--nao-lida" : ""}`}
      title={resumo.ultimaMensagem || undefined}
    >
      <MessageCircle size={13} />
      <span className="whatsapp-badge-preview">{resumo.ultimaMensagem}</span>
      {temNaoLidas && (
        <span className="whatsapp-badge-contador">{resumo.naoLidas}</span>
      )}
    </div>
  );
};

export default WhatsappBadge;
