import React, { useEffect, useMemo, useState } from "react";
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
  const { colaboradores, setores, delegarAluno } = useAlunos();
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
  // Supervisor: só pode delegar dentro do próprio setor (Engajamento).
  const responsaveis = useMemo(() => {
    let lista = colaboradores;
    if (
      user?.role === "supervisor" &&
      user.setorId &&
      aluno.area === "engajamento"
    ) {
      lista = colaboradores.filter(
        (c) => c.setorId === user.setorId || c.id === user.id
      );
    }
    if (user && !lista.some((item) => item.id === user.id)) {
      lista = [
        ...lista,
        {
          id: user.id,
          name: user.name,
          email: user.email,
          setorId: user.setorId,
          setorNome: user.setorNome,
        },
      ];
    }
    return lista;
  }, [colaboradores, user, aluno.area]);

  const ehEngajamento = aluno.area === "engajamento";

  // No Engajamento, agrupa por setor: o setor atual do contato aparece
  // primeiro (é o caso comum — trocar só o colaborador dentro do mesmo
  // setor), mas os outros setores continuam selecionáveis. Escolher
  // alguém de outro setor move o contato pra lá automaticamente (trigger
  // sincroniza_setor_ao_delegar no banco) — sem precisar mudar o setor
  // manualmente antes.
  const grupos = useMemo(() => {
    if (!ehEngajamento) return null;

    const porSetor = new Map<string, typeof responsaveis>();
    const semSetor: typeof responsaveis = [];

    responsaveis.forEach((colaborador) => {
      if (!colaborador.setorId) {
        semSetor.push(colaborador);
        return;
      }
      const lista = porSetor.get(colaborador.setorId) || [];
      lista.push(colaborador);
      porSetor.set(colaborador.setorId, lista);
    });

    const ordenados = [...setores]
      .filter((s) => porSetor.has(s.id))
      .sort((a, b) => {
        if (a.id === aluno.setorId) return -1;
        if (b.id === aluno.setorId) return 1;
        return a.nome.localeCompare(b.nome);
      })
      .map((setor) => ({
        setorId: setor.id,
        setorNome: setor.nome,
        atual: setor.id === aluno.setorId,
        colaboradores: porSetor.get(setor.id) || [],
      }));

    if (semSetor.length > 0) {
      ordenados.push({ setorId: "", setorNome: "Sem setor", atual: false, colaboradores: semSetor });
    }

    return ordenados;
  }, [ehEngajamento, responsaveis, setores, aluno.setorId]);

  const colaboradorSelecionado = responsaveis.find((c) => c.id === colaboradorId);
  const vaiMudarDeSetor =
    ehEngajamento &&
    !!colaboradorSelecionado?.setorId &&
    colaboradorSelecionado.setorId !== aluno.setorId;

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
            {grupos
              ? grupos.map((grupo) => (
                  <optgroup
                    key={grupo.setorId || "sem-setor"}
                    label={grupo.atual ? `${grupo.setorNome} (setor atual)` : grupo.setorNome}
                  >
                    {grupo.colaboradores.map((colaborador) => (
                      <option key={colaborador.id} value={colaborador.id}>
                        {colaborador.name}{colaborador.id === user?.id ? " (você)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))
              : responsaveis.map((colaborador) => (
                  <option key={colaborador.id} value={colaborador.id}>
                    {colaborador.name}{colaborador.id === user?.id ? " (você)" : ""}
                  </option>
                ))}
          </select>
        </label>
        {vaiMudarDeSetor && (
          <p className="delegar-contato-aviso-setor">
            {colaboradorSelecionado?.name} é do setor <strong>{colaboradorSelecionado?.setorNome}</strong>.
            Ao salvar, o contato será movido automaticamente para esse setor.
          </p>
        )}
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
