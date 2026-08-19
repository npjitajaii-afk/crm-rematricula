import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { CalendarClock, ClipboardList, Plus, Trash2, UserRound, X } from "lucide-react";
import { format } from "date-fns";
import EngajamentoTabs from "../components/EngajamentoTabs";
import RematriculaTabs from "../components/RematriculaTabs";
import { criarTarefaGeral, excluirTarefaGeral, getTarefasGerais, TarefaGeral } from "../services/tarefasGeraisService";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import "./PainelTarefasGeral.css";

const PainelTarefasGeral: React.FC = () => {
  const isRematricula = useLocation().pathname.startsWith("/rematricula/");
  const { user } = useAuth(); const { colaboradores } = useAlunos(); const { showToast } = useToast(); const { confirm } = useConfirm();
  const [tarefas, setTarefas] = useState<TarefaGeral[]>([]); const [carregando, setCarregando] = useState(true); const [modal, setModal] = useState(false); const [titulo, setTitulo] = useState(""); const [descricao, setDescricao] = useState(""); const [prazo, setPrazo] = useState(""); const [destinatario, setDestinatario] = useState(""); const [salvando, setSalvando] = useState(false);
  const carregar = async () => { setCarregando(true); const { tarefas: lista, error } = await getTarefasGerais(); if (error) showToast("Não foi possível carregar as tarefas.", "error"); else setTarefas(lista); setCarregando(false); };
  // `carregar` é intencionalmente executada apenas na entrada da aba.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, []);
  const abrir = () => { setTitulo(""); setDescricao(""); setPrazo(""); setDestinatario(colaboradores[0]?.id || ""); setModal(true); };
  const salvar = async (event: React.FormEvent) => { event.preventDefault(); if (!destinatario) return; setSalvando(true); const { error } = await criarTarefaGeral({ titulo, descricao, paraUserId: destinatario, prazo: prazo ? new Date(`${prazo}T12:00:00`) : undefined }); setSalvando(false); if (error) return showToast(error, "error"); showToast("Tarefa delegada.", "success"); setModal(false); carregar(); };
  const remover = async (id: string) => {
    const confirmado = await confirm("Deseja excluir esta tarefa delegada?", {
      title: "Excluir tarefa",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!confirmado) return;
    const { error } = await excluirTarefaGeral(id);
    if (error) return showToast(error, "error");
    setTarefas((atual) => atual.filter((tarefa) => tarefa.id !== id));
    showToast("Tarefa removida.", "success");
  };
  const admin = user?.role === "admin";
  return <div className="painel-tarefas-page">{isRematricula ? <RematriculaTabs /> : <EngajamentoTabs />}<div className="painel-tarefas-header"><div><h1><ClipboardList size={22} /> Painel de tarefas</h1><p>{admin ? "Crie e delegue tarefas para a equipe." : "Tarefas delegadas a você pelo administrador."}</p></div>{admin && <button className="btn btn-primary" onClick={abrir}><Plus size={18} /> Delegar tarefa</button>}</div>
    {carregando ? <div className="painel-vazio">Carregando tarefas...</div> : tarefas.length === 0 ? <div className="painel-vazio"><ClipboardList size={32} /><h2>Nenhuma tarefa encontrada</h2><p>{admin ? "Delegue a primeira tarefa para um colaborador." : "Você não possui tarefas delegadas."}</p></div> : <div className="painel-lista">{tarefas.map((tarefa) => <article key={tarefa.id} className="painel-tarefa"><div><h2>{tarefa.titulo}</h2>{tarefa.descricao && <p>{tarefa.descricao}</p>}<div>{admin && <span><UserRound size={14} /> {tarefa.paraUserNome}</span>}{tarefa.prazo && <span><CalendarClock size={14} /> Prazo: {format(tarefa.prazo, "dd/MM/yyyy")}</span>}</div></div>{admin && <button onClick={() => remover(tarefa.id)} aria-label="Excluir tarefa"><Trash2 size={16} /></button>}</article>)}</div>}
    {modal && <div className="modal-overlay" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setModal(false); }}><form className="painel-modal" onSubmit={salvar} onClick={(event) => event.stopPropagation()}><div><h2>Delegar tarefa</h2><button type="button" onClick={() => setModal(false)}><X size={18} /></button></div><label>Título<input value={titulo} onChange={(event) => setTitulo(event.target.value)} required maxLength={255} /></label><label>Colaborador<select value={destinatario} onChange={(event) => setDestinatario(event.target.value)} required><option value="" disabled>Selecione</option>{colaboradores.map((colaborador) => <option value={colaborador.id} key={colaborador.id}>{colaborador.name}</option>)}</select></label><label>Prazo (opcional)<input type="date" value={prazo} onChange={(event) => setPrazo(event.target.value)} /></label><label>Descrição (opcional)<textarea value={descricao} onChange={(event) => setDescricao(event.target.value)} rows={3} /></label><footer><button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" disabled={salvando}>{salvando ? "Salvando..." : "Delegar"}</button></footer></form></div>}
  </div>;
};
export default PainelTarefasGeral;
