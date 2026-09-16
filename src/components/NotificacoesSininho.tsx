import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, MessageSquare, Mail, CheckCheck, Volume2, VolumeX } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNotificacoes } from "../hooks/useNotificacoes";
import { Notificacao } from "../types";
import {
  isSomNotificacaoMudo,
  setSomNotificacaoMudo,
} from "../utils/notificationSound";
import "./NotificacoesSininho.css";

const iconePorTipo = (tipo: Notificacao["tipo"]) => {
  switch (tipo) {
    case "recado_admin":
      return Mail;
    case "nova_interacao":
      return MessageSquare;
    default:
      return Bell;
  }
};

const NotificacoesSininho: React.FC = () => {
  const { notificacoes, naoLidas, marcarLida, marcarTodasLidas } =
    useNotificacoes();
  const [isOpen, setIsOpen] = useState(false);
  const [somMudo, setSomMudo] = useState(() => isSomNotificacaoMudo());
  const navigate = useNavigate();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleClickNotificacao = (n: Notificacao) => {
    if (!n.lida) marcarLida(n.id);
    if (n.alunoId) {
      navigate(`/alunos/${n.alunoId}`);
      setIsOpen(false);
    }
  };

  const alternarSom = () => {
    setSomMudo((atual) => {
      const novo = !atual;
      setSomNotificacaoMudo(novo);
      return novo;
    });
  };

  const visiveis = notificacoes.slice(0, 20);

  return (
    <div className="sininho-wrapper" ref={wrapperRef}>
      <button
        className="sininho-btn"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Notificações"
      >
        <Bell size={18} />
        {naoLidas > 0 && (
          <span className="sininho-badge">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="sininho-dropdown" role="dialog">
          <div className="sininho-header">
            <span>Notificações</span>
            <div className="sininho-header-acoes">
              <button
                className="sininho-som-toggle"
                onClick={alternarSom}
                title={somMudo ? "Ativar som de notificação" : "Silenciar som de notificação"}
                aria-label={somMudo ? "Ativar som de notificação" : "Silenciar som de notificação"}
              >
                {somMudo ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              {naoLidas > 0 && (
                <button
                  className="sininho-marcar-todas"
                  onClick={() => marcarTodasLidas()}
                >
                  <CheckCheck size={14} />
                  Marcar todas como lidas
                </button>
              )}
            </div>
          </div>

          <div className="sininho-lista">
            {visiveis.length === 0 && (
              <p className="sininho-vazio">Nenhuma notificação por aqui.</p>
            )}

            {visiveis.map((n) => {
              const Icone = iconePorTipo(n.tipo);
              return (
                <button
                  key={n.id}
                  className={`sininho-item ${!n.lida ? "nao-lida" : ""}`}
                  onClick={() => handleClickNotificacao(n)}
                >
                  <div className="sininho-item-icon">
                    <Icone size={16} />
                  </div>
                  <div className="sininho-item-content">
                    <span className="sininho-item-titulo">{n.titulo}</span>
                    {n.corpo && (
                      <span className="sininho-item-corpo">{n.corpo}</span>
                    )}
                    <span className="sininho-item-meta">
                      {n.deUserNome ? `Por: ${n.deUserNome} · ` : ""}
                      há{" "}
                      {formatDistanceToNow(new Date(n.createdAt), {
                        locale: ptBR,
                      })}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificacoesSininho;
