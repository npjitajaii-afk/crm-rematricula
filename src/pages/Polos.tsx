import React, { useEffect, useState } from "react";
import { useAlunos } from "../hooks/useAlunos";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import { createPolo, updatePolo, deletePolo } from "../services/polosService";
import { MapPin, Plus, Loader2, Pencil, Trash2, Check, X } from "lucide-react";
import "./Polos.css";

const Polos: React.FC = () => {
  const { polos, isLoadingAlunos } = useAlunos();
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [lista, setLista] = useState(polos);
  const [novoNome, setNovoNome] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLista(polos);
  }, [polos]);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoNome.trim()) return;

    setSaving(true);
    const { polo, error } = await createPolo(novoNome);
    setSaving(false);

    if (error) {
      showToast(error, "error");
      return;
    }

    if (polo) {
      setLista((prev) => [...prev, polo].sort((a, b) => a.nome.localeCompare(b.nome)));
      setNovoNome("");
      showToast(`Polo "${polo.nome}" criado`, "success");
    }
  };

  const iniciarEdicao = (id: string, nome: string) => {
    setEditandoId(id);
    setEditNome(nome);
  };

  const salvarEdicao = async () => {
    if (!editandoId || !editNome.trim()) return;

    setSaving(true);
    const { error } = await updatePolo(editandoId, editNome);
    setSaving(false);

    if (error) {
      showToast(error, "error");
      return;
    }

    setLista((prev) =>
      prev
        .map((p) => (p.id === editandoId ? { ...p, nome: editNome.trim() } : p))
        .sort((a, b) => a.nome.localeCompare(b.nome))
    );
    setEditandoId(null);
    showToast("Polo atualizado", "success");
  };

  const excluir = async (id: string, nome: string) => {
    const ok = await confirm(`Excluir o polo "${nome}"? Só é possível se não houver alunos ou colaboradores vinculados.`, {
      danger: true,
      confirmLabel: "Excluir",
    });
    if (!ok) return;

    setSaving(true);
    const { error } = await deletePolo(id);
    setSaving(false);

    if (error) {
      showToast(error, "error");
      return;
    }

    setLista((prev) => prev.filter((p) => p.id !== id));
    showToast("Polo excluído", "success");
  };

  if (isLoadingAlunos && lista.length === 0) {
    return (
      <div className="polos-loading">
        <Loader2 size={32} className="spin" />
        <p>Carregando polos...</p>
      </div>
    );
  }

  return (
    <div className="polos-page">
      <div className="polos-header">
        <div>
          <h1>Polos</h1>
          <p className="polos-subtitle">
            Cadastre as unidades e atribua cada colaborador a um polo na tela de Usuários
          </p>
        </div>
      </div>

      <form className="polos-novo" onSubmit={criar}>
        <MapPin size={18} />
        <input
          type="text"
          placeholder="Nome do novo polo (ex: Itajaí, Blumenau...)"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          disabled={saving}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !novoNome.trim()}>
          <Plus size={16} /> Adicionar
        </button>
      </form>

      <div className="polos-list">
        {lista.length === 0 ? (
          <p className="polos-empty">Nenhum polo cadastrado ainda.</p>
        ) : (
          lista.map((polo) => (
            <div key={polo.id} className="polo-card">
              {editandoId === polo.id ? (
                <>
                  <input
                    className="polo-edit-input"
                    value={editNome}
                    onChange={(e) => setEditNome(e.target.value)}
                    disabled={saving}
                    autoFocus
                  />
                  <div className="polo-actions">
                    <button type="button" className="btn btn-success btn-sm" onClick={salvarEdicao} disabled={saving}>
                      <Check size={14} />
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditandoId(null)} disabled={saving}>
                      <X size={14} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="polo-nome">{polo.nome}</span>
                  <div className="polo-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => iniciarEdicao(polo.id, polo.nome)}
                      disabled={saving}
                      title="Renomear"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => excluir(polo.id, polo.nome)}
                      disabled={saving}
                      title="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Polos;
