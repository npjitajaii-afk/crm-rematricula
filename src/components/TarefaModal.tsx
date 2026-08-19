import React, { useState, useEffect } from "react";
import { X, Plus, Trash2, Check, Circle } from "lucide-react";
import { TarefaPessoal, TarefaPessoalStatus } from "../types";
import { useTarefasEngajamento } from "../hooks/useTarefasEngajamento";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import "./TarefaModal.css";

interface AlunoOption {
  id: string;
  name: string;
}

interface TarefaModalProps {
  onClose: () => void;
  tarefa?: TarefaPessoal;
  alunos: AlunoOption[];
  isAdmin?: boolean;
}

const TarefaModal: React.FC<TarefaModalProps> = ({
  onClose,
  tarefa,
  alunos,
  isAdmin,
}) => {
  const {
    criarTarefa,
    atualizarTarefa,
    excluirTarefa,
    toggleChecklistItem,
    adicionarChecklistItem,
    removerChecklistItem,
  } = useTarefasEngajamento();
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const isEdicao = !!tarefa;
  const podeEditar = !isEdicao || !isAdmin || tarefa.userId === undefined || true;

  const [titulo, setTitulo] = useState(tarefa?.titulo ?? "");
  const [anotacoes, setAnotacoes] = useState(tarefa?.anotacoes ?? "");
  const [alunoId, setAlunoId] = useState(tarefa?.alunoId ?? "");
  const [prazo, setPrazo] = useState(
    tarefa?.prazo ? tarefa.prazo.toISOString().slice(0, 10) : ""
  );
  const [status, setStatus] = useState<TarefaPessoalStatus>(
    tarefa?.status ?? "em_andamento"
  );
  const [novosItens, setNovosItens] = useState<{ texto: string }[]>([]);
  const [novoItemTexto, setNovoItemTexto] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isEdicao) {
      setNovosItens([]);
    }
  }, [isEdicao]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onClose]);

  const handleAddNovoItem = () => {
    if (!novoItemTexto.trim()) return;
    if (isEdicao && tarefa) {
      adicionarChecklistItem(tarefa.id, novoItemTexto.trim())
        .then(() => setNovoItemTexto(""))
        .catch((err) =>
          showToast(
            err instanceof Error ? err.message : "Erro ao adicionar item",
            "error"
          )
        );
    } else {
      setNovosItens((prev) => [...prev, { texto: novoItemTexto.trim() }]);
      setNovoItemTexto("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) {
      showToast("Informe o título da tarefa.", "error");
      return;
    }

    setIsSaving(true);
    try {
      if (isEdicao && tarefa) {
        await atualizarTarefa(tarefa.id, {
          titulo: titulo.trim(),
          anotacoes: anotacoes.trim(),
          alunoId: alunoId || null,
          prazo: prazo ? new Date(prazo + "T12:00:00") : null,
          status,
        });
        showToast("Tarefa atualizada!", "success");
      } else {
        await criarTarefa({
          titulo: titulo.trim(),
          anotacoes: anotacoes.trim() || undefined,
          alunoId: alunoId || undefined,
          prazo: prazo ? new Date(prazo + "T12:00:00") : undefined,
          checklist: novosItens,
        });
        showToast("Tarefa criada!", "success");
      }
      onClose();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Erro ao salvar tarefa",
        "error"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleExcluir = async () => {
    if (!tarefa) return;
    const ok = await confirm("Deseja excluir esta tarefa?", {
      title: "Excluir tarefa",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;

    try {
      await excluirTarefa(tarefa.id);
      showToast("Tarefa excluída.", "success");
      onClose();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Erro ao excluir tarefa",
        "error"
      );
    }
  };

  const checklistAtual = isEdicao && tarefa ? tarefa.checklist : [];

  return (
    <div className="modal-overlay" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-tarefa" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="tarefa-modal-titulo">
        <div className="modal-tarefa-header">
          <h2 id="tarefa-modal-titulo">{isEdicao ? "Editar tarefa" : "Nova tarefa"}</h2>
          <button className="modal-tarefa-close" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-tarefa-body">
          <div className="form-group">
            <label htmlFor="tarefa-titulo">Título *</label>
            <input
              id="tarefa-titulo"
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Ligar para o aluno sobre AV1"
              maxLength={255}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="tarefa-prazo">Prazo (opcional)</label>
              <input
                id="tarefa-prazo"
                type="date"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="tarefa-status">Status</label>
              <select
                id="tarefa-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TarefaPessoalStatus)}
              >
                <option value="em_andamento">Em andamento</option>
                <option value="concluido">Concluído</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="tarefa-aluno">Aluno vinculado (opcional)</label>
            <select
              id="tarefa-aluno"
              value={alunoId}
              onChange={(e) => setAlunoId(e.target.value)}
            >
              <option value="">Nenhum aluno</option>
              {alunos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="tarefa-anotacoes">Anotações (opcional)</label>
            <textarea
              id="tarefa-anotacoes"
              value={anotacoes}
              onChange={(e) => setAnotacoes(e.target.value)}
              placeholder="Observações, contexto, lembretes..."
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>Checklist (opcional)</label>
            <div className="tarefa-checklist">
              {checklistAtual.map((item) => (
                <div key={item.id} className="tarefa-checklist-item">
                  <button
                    type="button"
                    className={`tarefa-check-btn ${item.concluido ? "done" : ""}`}
                    onClick={() => toggleChecklistItem(item.id, !item.concluido)}
                    aria-label={item.concluido ? "Desmarcar" : "Marcar"}
                  >
                    {item.concluido ? <Check size={14} /> : <Circle size={14} />}
                  </button>
                  <span className={item.concluido ? "done" : ""}>{item.texto}</span>
                  <button
                    type="button"
                    className="tarefa-checklist-remove"
                    onClick={() => removerChecklistItem(item.id)}
                    aria-label="Remover item"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {!isEdicao &&
                novosItens.map((item, idx) => (
                  <div key={idx} className="tarefa-checklist-item">
                    <Circle size={14} className="tarefa-check-icon-pending" />
                    <span>{item.texto}</span>
                    <button
                      type="button"
                      className="tarefa-checklist-remove"
                      onClick={() =>
                        setNovosItens((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label="Remover item"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}

              <div className="tarefa-checklist-add">
                <input
                  type="text"
                  value={novoItemTexto}
                  onChange={(e) => setNovoItemTexto(e.target.value)}
                  placeholder="Adicionar item ao checklist..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddNovoItem();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleAddNovoItem}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>

          <div className="modal-tarefa-actions">
            {isEdicao && podeEditar && (
              <button
                type="button"
                className="btn btn-danger-outline"
                onClick={handleExcluir}
              >
                <Trash2 size={16} />
                Excluir
              </button>
            )}
            <div className="modal-tarefa-actions-right">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={isSaving}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSaving}>
                {isSaving ? "Salvando..." : isEdicao ? "Salvar" : "Criar tarefa"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TarefaModal;
