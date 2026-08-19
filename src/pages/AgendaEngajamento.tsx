import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardList, Plus, Ticket, Trash2, UserRound, X } from "lucide-react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfToday, startOfWeek, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import EngajamentoTabs from "../components/EngajamentoTabs";
import RematriculaTabs from "../components/RematriculaTabs";
import { useAgendaEngajamento } from "../hooks/useAgendaEngajamento";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import { AgendaCompromisso } from "../types";
import "./AgendaEngajamento.css";

const AgendaEngajamento: React.FC<{ area?: "engajamento" | "rematricula" }> = ({ area = "engajamento" }) => {
  const { compromissos, isLoading, criarCompromisso, excluirCompromisso } = useAgendaEngajamento();
  const { alunos } = useAlunos(); const { user } = useAuth(); const { showToast } = useToast(); const { confirm } = useConfirm();
  const [mes, setMes] = useState(startOfToday()); const [selecionada, setSelecionada] = useState(startOfToday()); const [aberto, setAberto] = useState(false); const [alunoId, setAlunoId] = useState(""); const [ticket, setTicket] = useState(""); const [comentario, setComentario] = useState(""); const [salvando, setSalvando] = useState(false);
  const meusAlunos = useMemo(() => alunos.filter((aluno) => aluno.area === area && aluno.assignedTo === user?.id).sort((a, b) => a.name.localeCompare(b.name)), [alunos, user, area]);
  const dias = useMemo(() => eachDayOfInterval({ start: startOfWeek(startOfMonth(mes), { weekStartsOn: 0 }), end: endOfWeek(endOfMonth(mes), { weekStartsOn: 0 }) }), [mes]);
  const compromissosDoDia = useMemo(() => compromissos.filter((item) => isSameDay(item.data, selecionada)), [compromissos, selecionada]);
  const abrir = () => { setAlunoId(meusAlunos[0]?.id ?? ""); setTicket(""); setComentario(""); setAberto(true); };
  const salvar = async (event: React.FormEvent) => { event.preventDefault(); if (!alunoId || !comentario.trim()) return; setSalvando(true); try { await criarCompromisso({ alunoId, data: selecionada, ticket, comentario }); showToast("Agendamento criado.", "success"); setAberto(false); } catch (erro) { showToast(erro instanceof Error ? erro.message : "Erro ao criar agendamento", "error"); } finally { setSalvando(false); } };
  const remover = async (item: AgendaCompromisso) => {
    const confirmado = await confirm("Deseja excluir este agendamento?", {
      title: "Excluir agendamento",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!confirmado) return;
    try { await excluirCompromisso(item.id); showToast("Agendamento removido.", "success"); } catch { showToast("Erro ao remover agendamento", "error"); }
  };
  return <div className="agenda-page">{area === "rematricula" ? <RematriculaTabs /> : <EngajamentoTabs />}
    <div className="agenda-header"><div><h1><ClipboardList size={22} /> Agenda</h1><p>Selecione um dia para registrar um chamado para um aluno sob sua responsabilidade.</p></div><button className="btn btn-primary" onClick={abrir} disabled={!meusAlunos.length}><Plus size={18} /> Novo agendamento</button></div>
    {!meusAlunos.length && <div className="agenda-aviso">Você ainda não possui alunos de Engajamento sob sua responsabilidade para agendar.</div>}
    <div className="agenda-layout"><section className="calendario"><div className="calendario-nav"><button onClick={() => setMes(subMonths(mes, 1))} aria-label="Mês anterior"><ChevronLeft size={18} /></button><strong>{format(mes, "MMMM 'de' yyyy", { locale: ptBR })}</strong><button onClick={() => setMes(addMonths(mes, 1))} aria-label="Próximo mês"><ChevronRight size={18} /></button></div><div className="calendario-semana">{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((dia) => <span key={dia}>{dia}</span>)}</div><div className="calendario-grade">{dias.map((dia) => { const quantidade = compromissos.filter((item) => isSameDay(item.data, dia)).length; return <button key={dia.toISOString()} onClick={() => setSelecionada(dia)} className={`${!isSameMonth(dia, mes) ? "fora" : ""} ${isSameDay(dia, selecionada) ? "selecionado" : ""} ${isSameDay(dia, startOfToday()) ? "hoje" : ""}`}><span>{format(dia, "d")}</span>{quantidade > 0 && <i>{quantidade}</i>}</button>; })}</div></section>
      <aside className="agenda-dia"><div className="agenda-dia-titulo"><div><span>Compromissos em</span><h2>{format(selecionada, "dd 'de' MMMM", { locale: ptBR })}</h2></div><button className="btn btn-primary btn-sm" onClick={abrir} disabled={!meusAlunos.length}><Plus size={16} /></button></div>{isLoading ? <p>Carregando...</p> : compromissosDoDia.length === 0 ? <p className="agenda-sem-itens">Nenhum compromisso neste dia.</p> : compromissosDoDia.map((item) => <article className="agenda-item" key={item.id}><div><h3><UserRound size={14} /> {item.alunoNome}</h3>{item.ticket && <span><Ticket size={13} /> Ticket {item.ticket}</span>}<p>{item.comentario}</p></div><button onClick={() => remover(item)} aria-label="Excluir agendamento"><Trash2 size={15} /></button></article>)}</aside></div>
    {aberto && <div className="modal-overlay" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setAberto(false); }}><form className="agenda-modal" onSubmit={salvar} onClick={(event) => event.stopPropagation()}><div><h2>Novo agendamento</h2><button type="button" onClick={() => setAberto(false)}><X size={18} /></button></div><p>Data: <strong>{format(selecionada, "dd/MM/yyyy")}</strong></p><label>Aluno responsável<select value={alunoId} onChange={(event) => setAlunoId(event.target.value)} required>{meusAlunos.map((aluno) => <option key={aluno.id} value={aluno.id}>{aluno.name}</option>)}</select></label><label>Número do ticket (opcional)<input value={ticket} onChange={(event) => setTicket(event.target.value)} placeholder="Ex.: #12345" maxLength={100} /></label><label>Comentário do chamado<textarea value={comentario} onChange={(event) => setComentario(event.target.value)} placeholder="Descreva o que precisa ser acompanhado..." rows={4} required /></label><div className="agenda-modal-acoes"><button type="button" className="btn btn-secondary" onClick={() => setAberto(false)}>Cancelar</button><button className="btn btn-primary" disabled={salvando}>{salvando ? "Salvando..." : "Agendar"}</button></div></form></div>}
  </div>;
};
export default AgendaEngajamento;
