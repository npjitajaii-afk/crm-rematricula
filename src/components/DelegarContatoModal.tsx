import React, { useEffect, useState } from "react";
import { Users, X } from "lucide-react";
import { Aluno } from "../types";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import "./DelegarContatoModal.css";

interface DelegarContatoModalProps {
  aluno: Aluno;
  onClose: () => void;
}

const DelegarContatoModal: React.FC<DelegarContatoModalProps> = ({ aluno, onClose }) => {
  const { colaboradores, delegarAluno } = useAlunos();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [colaboradorId, setColaboradorId] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !salvando) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, salvando]);

  // Garante que o usuário atual também seja uma opção, inclusive quando a
  // consulta de perfis for limitada pelas permissões do banco.
  const responsaveis = user && !colaboradores.some((item) => item.id === user.id)
    ? [...colaboradores, { id: user.id, name: user.name, email: user.email }]
    : colaboradores;

  const salvar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!colaboradorId) return;

    setSalvando(true);
    try {
      await delegarAluno(aluno.id, colaboradorId);
      showToast("Contato delegado com sucesso.", "success");
      onClose();
    } catch {
      showToast("Erro ao delegar contato. Tente novamente.", "error");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
      <form
        className="delegar-contato-modal"
        onSubmit={salvar}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delegar-contato-titulo"
      >
        <div className="delegar-contato-header">
          <h2 id="delegar-contato-titulo"><Users size={19} /> {aluno.assignedTo ? "Reatribuir contato" : "Delegar contato"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <p>{aluno.assignedTo ? "Altere o responsável por" : "Escolha quem será responsável por"} <strong>{aluno.name}</strong>.</p>
        <label>
          Colaborador
          <select value={colaboradorId} onChange={(event) => setColaboradorId(event.target.value)} required>
            <option value="" disabled>{aluno.assignedTo ? "Selecione outro colaborador" : "Selecione um colaborador"}</option>
            {responsaveis.map((colaborador) => (
              <option key={colaborador.id} value={colaborador.id}>
                {colaborador.name}{colaborador.id === user?.id ? " (você)" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="delegar-contato-acoes">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={salvando || !colaboradorId}>
            {salvando ? "Salvando..." : aluno.assignedTo ? "Reatribuir" : "Delegar"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default DelegarContatoModal;