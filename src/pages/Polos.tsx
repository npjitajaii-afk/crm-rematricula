import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import { createPolo, updatePolo, deletePolo } from "../services/polosService";
import {
  getSetoresDoPolo,
  createSetor,
  updateSetor,
  deleteSetor,
} from "../services/setoresService";
import { Setor } from "../types";
import {
  MapPin,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Check,
  X,
  Layers,
} from "lucide-react";
import "./Polos.css";

type AbaPolos = "polos" | "setores";

const Polos: React.FC = () => {
  const { polos, isLoadingAlunos } = useAlunos();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const isCreator = user?.role === "creator";
  // Setores: sempre do polo do usuário logado (admin e creator)
  const poloSetoresId = user?.poloId;
  const poloSetoresNome =
    polos.find((p) => p.id === poloSetoresId)?.nome || user?.poloNome || "seu polo";

  const [aba, setAba] = useState<AbaPolos>(isCreator ? "polos" : "setores");
  const [lista, setLista] = useState(polos);
  const [novoNome, setNovoNome] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [saving, setSaving] = useState(false);

  // ---- Setores (polo do usuário) ----
  const [setoresItajai, setSetoresItajai] = useState<Setor[]>([]);
  const [carregandoSetores, setCarregandoSetores] = useState(false);
  const [novoSetorNome, setNovoSetorNome] = useState("");
  const [editandoSetorId, setEditandoSetorId] = useState<string | null>(null);
  const [editSetorNome, setEditSetorNome] = useState("");

  useEffect(() => {
    setLista(polos);
  }, [polos]);

  const carregarSetores = useCallback(async () => {
    if (!poloSetoresId) {
      setSetoresItajai([]);
      return;
    }
    setCarregandoSetores(true);
    const { setores, error } = await getSetoresDoPolo(poloSetoresId);
    setCarregandoSetores(false);
    if (error) {
      showToast(error, "error");
      return;
    }
    setSetoresItajai(setores.filter((s) => s.nome !== "Geral" && s.nome !== "Pendente"));
  }, [poloSetoresId, showToast]);

  useEffect(() => {
    if (aba === "setores") {
      carregarSetores();
    }
  }, [aba, carregarSetores]);

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
      setLista((prev) =>
        [...prev, polo].sort((a, b) => a.nome.localeCompare(b.nome))
      );
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
        .map((p) =>
          p.id === editandoId ? { ...p, nome: editNome.trim() } : p
        )
        .sort((a, b) => a.nome.localeCompare(b.nome))
    );
    setEditandoId(null);
    showToast("Polo atualizado", "success");
  };

  const excluir = async (id: string, nome: string) => {
    const ok = await confirm(
      `Excluir o polo "${nome}"? Só é possível se não houver alunos ou colaboradores vinculados.`,
      {
        danger: true,
        confirmLabel: "Excluir",
      }
    );
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

  // ---- CRUD setores Itajaí ----
  const criarSetor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poloSetoresId || !novoSetorNome.trim()) return;

    setSaving(true);
    const { setor, error } = await createSetor(novoSetorNome, poloSetoresId);
    setSaving(false);

    if (error) {
      showToast(error, "error");
      return;
    }
    if (setor) {
      setSetoresItajai((prev) =>
        [...prev, setor].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      );
      setNovoSetorNome("");
      showToast(`Setor "${setor.nome}" criado`, "success");
    }
  };

  const salvarEdicaoSetor = async () => {
    if (!editandoSetorId || !editSetorNome.trim()) return;
    setSaving(true);
    const { error } = await updateSetor(editandoSetorId, {
      nome: editSetorNome,
    });
    setSaving(false);
    if (error) {
      showToast(error, "error");
      return;
    }
    setSetoresItajai((prev) =>
      prev
        .map((s) =>
          s.id === editandoSetorId ? { ...s, nome: editSetorNome.trim() } : s
        )
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    );
    setEditandoSetorId(null);
    showToast("Setor atualizado", "success");
  };

  const excluirSetor = async (id: string, nome: string) => {
    const ok = await confirm(
      `Excluir o setor "${nome}"? Colaboradores e contatos vinculados ficarão sem setor.`,
      { danger: true, confirmLabel: "Excluir" }
    );
    if (!ok) return;

    setSaving(true);
    const { error } = await deleteSetor(id);
    setSaving(false);
    if (error) {
      showToast(error, "error");
      return;
    }
    setSetoresItajai((prev) => prev.filter((s) => s.id !== id));
    showToast("Setor excluído", "success");
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
            {isCreator
              ? "Cadastre polos e gerencie setores de Engajamento do seu polo"
              : "Gerencie setores de Engajamento do seu polo"}
          </p>
        </div>
      </div>

      <nav className="polos-tabs" aria-label="Seções de polos">
        {isCreator && (
          <button
            type="button"
            className={`polos-tab${aba === "polos" ? " active" : ""}`}
            onClick={() => setAba("polos")}
          >
            <MapPin size={15} />
            Polos
          </button>
        )}
        <button
          type="button"
          className={`polos-tab${aba === "setores" ? " active" : ""}`}
          onClick={() => setAba("setores")}
        >
          <Layers size={15} />
          Setores · {poloSetoresNome}
        </button>
      </nav>

      {isCreator && aba === "polos" && (
        <>
          <form className="polos-novo" onSubmit={criar}>
            <MapPin size={18} />
            <input
              type="text"
              placeholder="Nome do novo polo (ex: Itajaí, Blumenau...)"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              disabled={saving}
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={saving || !novoNome.trim()}
            >
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
                        <button
                          type="button"
                          className="btn btn-success btn-sm"
                          onClick={salvarEdicao}
                          disabled={saving}
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setEditandoId(null)}
                          disabled={saving}
                        >
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
        </>
      )}

      {aba === "setores" && (
        <>
          {!poloSetoresId ? (
            <p className="polos-empty">
              Seu usuário não tem polo definido. Peça ao creator para vincular
              um polo ao seu perfil antes de gerenciar setores.
            </p>
          ) : (
            <>
              <p className="polos-setores-hint">
                Setores do Engajamento do polo <strong>{poloSetoresNome}</strong>.
                Admin e creator só gerenciam setores do próprio polo.
              </p>

              <form className="polos-novo" onSubmit={criarSetor}>
                <Layers size={18} />
                <input
                  type="text"
                  placeholder="Nome do novo setor (ex: Comercial, Contato...)"
                  value={novoSetorNome}
                  onChange={(e) => setNovoSetorNome(e.target.value)}
                  disabled={saving}
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={saving || !novoSetorNome.trim()}
                >
                  <Plus size={16} /> Adicionar
                </button>
              </form>

              {carregandoSetores ? (
                <div className="polos-loading" style={{ minHeight: 120 }}>
                  <Loader2 size={24} className="spin" />
                  <p>Carregando setores...</p>
                </div>
              ) : (
                <div className="polos-list">
                  {setoresItajai.length === 0 ? (
                    <p className="polos-empty">Nenhum setor cadastrado ainda.</p>
                  ) : (
                    setoresItajai.map((setor) => (
                      <div key={setor.id} className="polo-card">
                        {editandoSetorId === setor.id ? (
                          <>
                            <input
                              className="polo-edit-input"
                              value={editSetorNome}
                              onChange={(e) => setEditSetorNome(e.target.value)}
                              disabled={saving}
                              autoFocus
                            />
                            <div className="polo-actions">
                              <button
                                type="button"
                                className="btn btn-success btn-sm"
                                onClick={salvarEdicaoSetor}
                                disabled={saving}
                              >
                                <Check size={14} />
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setEditandoSetorId(null)}
                                disabled={saving}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="polo-nome">
                              {setor.nome}
                              {!setor.ativo && (
                                <span className="polo-inativo"> inativo</span>
                              )}
                            </span>
                            <div className="polo-actions">
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setEditandoSetorId(setor.id);
                                  setEditSetorNome(setor.nome);
                                }}
                                disabled={saving}
                                title="Renomear"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => excluirSetor(setor.id, setor.nome)}
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
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default Polos;
