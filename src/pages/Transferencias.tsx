import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Search, Users, Loader2, Inbox } from "lucide-react";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { Aluno, Usuario, SolicitacaoTransferencia } from "../types";
import { buscarAlunosPolo } from "../services/alunosService";
import { getUsuarios, definirSetorUsuario } from "../services/usuariosService";
import {
  listarSolicitacoesTransferencia,
  decidirSolicitacaoTransferencia,
} from "../services/transferenciasService";
import { useTransferenciasPendentes } from "../hooks/useTransferenciasPendentes";
import "./Transferencias.css";

type Aba = "solicitacoes" | "alunos" | "colaboradores";

const AREA_LABEL: Record<Aluno["area"], string> = {
  rematricula: "Rematrícula",
  retencao: "Retenção",
  engajamento: "Engajamento",
};

/**
 * Tela de Transferências (admin + supervisor). Duas ações independentes:
 *  - Alunos: busca um contato em qualquer área e muda setor e/ou
 *    colaborador responsável, sem precisar abrir o funil certo primeiro.
 *  - Colaboradores: muda o setor de um colaborador (nunca de outro
 *    admin/supervisor — regra confirmada com o usuário).
 */
const Transferencias: React.FC = () => {
  const { setores, colaboradores, updateAluno, delegarAluno } = useAlunos();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { refresh: refreshPendentesGlobais } = useTransferenciasPendentes();
  const [aba, setAba] = useState<Aba>("solicitacoes");

  // ---- Aba Solicitações ----
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoTransferencia[]>([]);
  const [carregandoSols, setCarregandoSols] = useState(false);
  const [decidindoId, setDecidindoId] = useState<string | null>(null);

  const carregarSolicitacoes = async () => {
    setCarregandoSols(true);
    const { solicitacoes: lista, error } = await listarSolicitacoesTransferencia(true);
    if (error) showToast(error, "error");
    // Gestor vê as que estão aguardando_gestor; também mostra as aguardando_responsavel do polo
    setSolicitacoes(lista);
    setCarregandoSols(false);
  };

  useEffect(() => {
    if (aba === "solicitacoes") carregarSolicitacoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba]);

  const decidir = async (id: string, aprovar: boolean) => {
    setDecidindoId(id);
    const { error } = await decidirSolicitacaoTransferencia(id, aprovar);
    if (error) showToast(error, "error");
    else {
      showToast(aprovar ? "Transferência aprovada e aplicada." : "Solicitação recusada.", aprovar ? "success" : "info");
      await carregarSolicitacoes();
      await refreshPendentesGlobais();
    }
    setDecidindoId(null);
  };

  // ---- Aba Alunos ----
  const [termoBusca, setTermoBusca] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<Aluno[]>([]);
  const [alunoSelecionado, setAlunoSelecionado] = useState<Aluno | null>(null);
  const [novoSetorId, setNovoSetorId] = useState("");
  const [novoColaboradorId, setNovoColaboradorId] = useState("");
  const [salvandoAluno, setSalvandoAluno] = useState(false);

  useEffect(() => {
    const termo = termoBusca.trim();
    if (termo.length < 2) {
      setResultados([]);
      return;
    }
    let cancelado = false;
    setBuscando(true);
    const timeout = setTimeout(async () => {
      const { alunos, error } = await buscarAlunosPolo(termo);
      if (cancelado) return;
      if (error) showToast(error, "error");
      setResultados(alunos);
      setBuscando(false);
    }, 350);

    return () => {
      cancelado = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termoBusca]);

  const selecionarAluno = (aluno: Aluno) => {
    setAlunoSelecionado(aluno);
    setNovoSetorId(aluno.setorId || "");
    setNovoColaboradorId(aluno.assignedTo || "");
  };

  const colaboradorAtual = colaboradores.find((c) => c.id === alunoSelecionado?.assignedTo);

  const salvarAluno = async () => {
    if (!alunoSelecionado) return;
    const setorMudou =
      alunoSelecionado.area === "engajamento" && novoSetorId !== (alunoSelecionado.setorId || "");
    const colaboradorMudou = novoColaboradorId !== (alunoSelecionado.assignedTo || "");

    if (!setorMudou && !colaboradorMudou) return;

    setSalvandoAluno(true);
    try {
      if (colaboradorMudou && novoColaboradorId) {
        // Delegar já sincroniza o setor automaticamente pro do novo
        // colaborador (trigger no banco) — não precisamos mandar setorId
        // junto aqui.
        await delegarAluno(alunoSelecionado.id, novoColaboradorId);
        // Se além de trocar o colaborador o setor escolhido for outro
        // (ex.: mover só o aluno, mantendo alguém do setor de destino),
        // aplicamos por cima.
        if (setorMudou) {
          await updateAluno(alunoSelecionado.id, { setorId: novoSetorId });
        }
      } else if (setorMudou) {
        await updateAluno(alunoSelecionado.id, { setorId: novoSetorId });
      }
      showToast("Transferência concluída.", "success");
      setAlunoSelecionado(null);
      setResultados([]);
      setTermoBusca("");
    } catch {
      showToast("Erro ao transferir o contato. Tente novamente.", "error");
    } finally {
      setSalvandoAluno(false);
    }
  };

  const setoresDoAlunoSelecionado = useMemo(
    () => setores.filter((s) => s.poloId === alunoSelecionado?.poloId),
    [setores, alunoSelecionado?.poloId]
  );

  const colaboradoresDoSetorEscolhido = useMemo(() => {
    if (!alunoSelecionado || alunoSelecionado.area !== "engajamento") return colaboradores;
    if (!novoSetorId) return colaboradores;
    return colaboradores.filter((c) => c.setorId === novoSetorId || c.id === novoColaboradorId);
  }, [colaboradores, alunoSelecionado, novoSetorId, novoColaboradorId]);

  // ---- Aba Colaboradores ----
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (aba !== "colaboradores") return;
    setCarregandoUsuarios(true);
    getUsuarios().then(({ usuarios: lista, error }) => {
      if (error) showToast(error, "error");
      // Supervisor: só colaboradores do próprio polo.
      // Admin: todos os polos.
      setUsuarios(
        lista.filter((u) => {
          if (u.role !== "colaborador" || u.status !== "aprovado") return false;
          if (user?.role === "admin") return true;
          return !!user?.poloId && u.poloId === user.poloId;
        })
      );
      setCarregandoUsuarios(false);
    });
  }, [aba, showToast, user?.role, user?.poloId]);

  const alterarSetorColaborador = async (usuario: Usuario, setorId: string) => {
    const anterior = usuario.setorId;
    const anteriorNome = usuario.setorNome;
    const novoNome = setores.find((s) => s.id === setorId)?.nome;

    setUsuarios((prev) =>
      prev.map((u) => (u.id === usuario.id ? { ...u, setorId, setorNome: novoNome } : u))
    );
    setSavingId(usuario.id);

    const { error } = await definirSetorUsuario(usuario.id, setorId || null);
    if (error) {
      showToast(error, "error");
      setUsuarios((prev) =>
        prev.map((u) => (u.id === usuario.id ? { ...u, setorId: anterior, setorNome: anteriorNome } : u))
      );
    } else {
      showToast(`Setor de ${usuario.name} atualizado.`, "success");
    }
    setSavingId(null);
  };

  return (
    <div className="transferencias-page">
      <div className="transferencias-header">
        <h1><ArrowLeftRight size={26} /> Transferências</h1>
        <p className="transferencias-subtitle">
          Aprove solicitações, mova um contato de setor/colaborador, ou mude o setor de um colaborador.
        </p>
      </div>

      <div className="transferencias-tabs">
        <button
          type="button"
          className={aba === "solicitacoes" ? "active" : ""}
          onClick={() => setAba("solicitacoes")}
        >
          <Inbox size={16} />
          Solicitações
          {solicitacoes.filter((s) => s.status === "aguardando_gestor").length > 0 && (
            <span className="transferencias-tab-badge">
              {solicitacoes.filter((s) => s.status === "aguardando_gestor").length}
            </span>
          )}
        </button>
        <button
          type="button"
          className={aba === "alunos" ? "active" : ""}
          onClick={() => setAba("alunos")}
        >
          Alunos
        </button>
        <button
          type="button"
          className={aba === "colaboradores" ? "active" : ""}
          onClick={() => setAba("colaboradores")}
        >
          Colaboradores
        </button>
      </div>

      {aba === "solicitacoes" && (
        <div className="transferencias-secao">
          {carregandoSols ? (
            <p className="transferencias-vazio"><Loader2 size={16} className="spin" /> Carregando solicitações...</p>
          ) : solicitacoes.length === 0 ? (
            <p className="transferencias-vazio">Nenhuma solicitação pendente no momento.</p>
          ) : (
            <ul className="transferencias-resultados">
              {solicitacoes.map((sol) => (
                <li key={sol.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                  <div>
                    <strong>{sol.alunoNome || "Contato"}</strong>
                    <span style={{ display: "block", fontSize: "0.85rem", color: "#6b7280" }}>
                      {sol.tipo === "assumir_responsabilidade" ? "Assumir responsabilidade" : "Mudança de setor"}
                      {" · "}
                      {sol.solicitanteNome ? `pedido por ${sol.solicitanteNome}` : ""}
                    </span>
                    <span style={{ display: "block", fontSize: "0.85rem" }}>
                      {sol.setorOrigemNome || "sem setor"} → {sol.setorDestinoNome || "?"}
                      {sol.colaboradorDestinoNome ? ` · colab: ${sol.colaboradorDestinoNome}` : " · sem colaborador"}
                    </span>
                    <span style={{ display: "block", fontSize: "0.8rem", color: "#6b7280" }}>
                      Status:{" "}
                      {sol.status === "aguardando_responsavel"
                        ? "Aguardando autorização do responsável atual"
                        : sol.status === "aguardando_gestor"
                        ? "Aguardando sua aprovação"
                        : sol.status}
                      {sol.motivo ? ` · Motivo: ${sol.motivo}` : ""}
                    </span>
                  </div>
                  {sol.status === "aguardando_gestor" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={decidindoId === sol.id}
                        onClick={() => decidir(sol.id, true)}
                      >
                        Aprovar
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={decidindoId === sol.id}
                        onClick={() => decidir(sol.id, false)}
                      >
                        Recusar
                      </button>
                    </div>
                  )}
                  {sol.status === "aguardando_responsavel" && (
                    <p style={{ margin: 0, fontSize: "0.8rem", color: "#92400e" }}>
                      Aguardando {sol.responsavelOrigemNome || "o responsável atual"} autorizar o pedido.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {aba === "alunos" && (
        <div className="transferencias-secao">
          <div className="transferencias-busca">
            <Search size={18} />
            <input
              type="text"
              placeholder="Buscar por nome, e-mail, telefone ou RA..."
              value={termoBusca}
              onChange={(e) => {
                setTermoBusca(e.target.value);
                setAlunoSelecionado(null);
              }}
            />
            {buscando && <Loader2 size={16} className="spin" />}
          </div>

          {!alunoSelecionado && resultados.length > 0 && (
            <ul className="transferencias-resultados">
              {resultados.map((aluno) => (
                <li key={aluno.id}>
                  <button type="button" onClick={() => selecionarAluno(aluno)}>
                    <strong>{aluno.name}</strong>
                    <span>{AREA_LABEL[aluno.area]}{aluno.setorNome ? ` · ${aluno.setorNome}` : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!alunoSelecionado && !buscando && termoBusca.trim().length >= 2 && resultados.length === 0 && (
            <p className="transferencias-vazio">Nenhum contato encontrado.</p>
          )}

          {alunoSelecionado && (
            <div className="transferencias-card">
              <div className="transferencias-card-topo">
                <div>
                  <strong>{alunoSelecionado.name}</strong>
                  <span className="transferencias-card-area">{AREA_LABEL[alunoSelecionado.area]}</span>
                </div>
                <button type="button" className="btn btn-secondary" onClick={() => setAlunoSelecionado(null)}>
                  Trocar contato
                </button>
              </div>

              <p className="transferencias-card-atual">
                Responsável atual: <strong>{colaboradorAtual?.name || "Sem responsável"}</strong>
                {alunoSelecionado.setorNome && <> · Setor atual: <strong>{alunoSelecionado.setorNome}</strong></>}
              </p>

              {alunoSelecionado.area === "engajamento" && (
                <label>
                  Setor
                  <select value={novoSetorId} onChange={(e) => setNovoSetorId(e.target.value)}>
                    <option value="">Sem setor</option>
                    {setoresDoAlunoSelecionado.map((s) => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>
                </label>
              )}

              <label>
                Colaborador responsável
                <select value={novoColaboradorId} onChange={(e) => setNovoColaboradorId(e.target.value)}>
                  <option value="">Sem responsável</option>
                  {colaboradoresDoSetorEscolhido.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>

              <div className="transferencias-card-acoes">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={salvandoAluno}
                  onClick={salvarAluno}
                >
                  {salvandoAluno ? "Salvando..." : "Salvar transferência"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {aba === "colaboradores" && (
        <div className="transferencias-secao">
          {carregandoUsuarios ? (
            <p className="transferencias-vazio"><Loader2 size={16} className="spin" /> Carregando colaboradores...</p>
          ) : usuarios.length === 0 ? (
            <p className="transferencias-vazio">Nenhum colaborador aprovado encontrado.</p>
          ) : (
            <ul className="transferencias-colaboradores">
              {usuarios.map((usuario) => {
                const setoresDoPolo = setores.filter((s) => s.poloId === usuario.poloId);
                return (
                  <li key={usuario.id}>
                    <div className="transferencias-colaborador-info">
                      <Users size={16} />
                      <div>
                        <strong>{usuario.name}</strong>
                        <span>{usuario.email}{usuario.poloNome ? ` · ${usuario.poloNome}` : ""}</span>
                      </div>
                    </div>
                    <select
                      value={usuario.setorId || ""}
                      disabled={savingId === usuario.id}
                      onChange={(e) => alterarSetorColaborador(usuario, e.target.value)}
                    >
                      <option value="" disabled>Selecione um setor</option>
                      {setoresDoPolo.map((s) => (
                        <option key={s.id} value={s.id}>{s.nome}</option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default Transferencias;
