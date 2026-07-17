import React, { useState } from "react";
import { X, Send } from "lucide-react";
import { useNotificacoes } from "../hooks/useNotificacoes";
import { useToast } from "../hooks/useToast";
import "./ModalRecado.css";

interface Colaborador {
  id: string;
  name: string;
  email: string;
}

interface ModalRecadoProps {
  onClose: () => void;
  colaboradores: Colaborador[];
  /** Pré-seleciona um destinatário específico (ex: envelope na linha do ranking) */
  destinatarioInicial?: string;
}

const TODOS = "__todos__";

const ModalRecado: React.FC<ModalRecadoProps> = ({
  onClose,
  colaboradores,
  destinatarioInicial,
}) => {
  const { enviarRecado } = useNotificacoes();
  const { showToast } = useToast();

  const [destinatario, setDestinatario] = useState(
    destinatarioInicial || TODOS
  );
  const [titulo, setTitulo] = useState("");
  const [corpo, setCorpo] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !corpo.trim()) {
      showToast("Preencha o título e a mensagem do recado.", "error");
      return;
    }

    setIsSending(true);
    try {
      if (destinatario === TODOS) {
        await Promise.all(
          colaboradores.map((c) => enviarRecado(c.id, titulo.trim(), corpo.trim()))
        );
      } else {
        await enviarRecado(destinatario, titulo.trim(), corpo.trim());
      }
      showToast("Recado enviado com sucesso!", "success");
      onClose();
    } catch (error) {
      showToast(
        "Erro ao enviar recado: " +
          (error instanceof Error ? error.message : "erro desconhecido"),
        "error"
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-recado" onClick={(e) => e.stopPropagation()}>
        <div className="modal-recado-header">
          <h2>Enviar recado</h2>
          <button className="modal-recado-close" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-recado-body">
          <div className="form-group">
            <label htmlFor="recado-destinatario">Para</label>
            <select
              id="recado-destinatario"
              value={destinatario}
              onChange={(e) => setDestinatario(e.target.value)}
            >
              <option value={TODOS}>Todos os colaboradores</option>
              {colaboradores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="recado-titulo">Título</label>
            <input
              id="recado-titulo"
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Reunião amanhã às 9h"
              maxLength={255}
            />
          </div>

          <div className="form-group">
            <label htmlFor="recado-corpo">Mensagem</label>
            <textarea
              id="recado-corpo"
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              placeholder="Escreva a mensagem..."
              rows={4}
            />
          </div>

          <div className="modal-recado-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSending}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSending}>
              <Send size={16} />
              {isSending ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalRecado;
