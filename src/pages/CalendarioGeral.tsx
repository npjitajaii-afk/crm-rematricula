import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { CalendarDays, Edit3, Phone, Save, Ticket } from "lucide-react";
import { eachDayOfInterval, endOfMonth, format, isSameDay, startOfMonth, startOfToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import EngajamentoTabs from "../components/EngajamentoTabs";
import RematriculaTabs from "../components/RematriculaTabs";
import { CalendarioGeralConfig, getCalendarioGeral, atualizarCalendarioGeral } from "../services/calendarioGeralService";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import "./CalendarioGeral.css";

const CalendarioGeral: React.FC = () => {
  const isRematricula = useLocation().pathname.startsWith("/rematricula/");
  const { user } = useAuth(); const { showToast } = useToast();
  const [config, setConfig] = useState<CalendarioGeralConfig | null>(null); const [editando, setEditando] = useState(false); const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ dia_boleto: 10, titulo: "Vencimento de boleto", mensagem: "Hoje é o dia de vencimento do boleto. Direcione o aluno para os canais de suporte, se necessário.", numeros_suporte: "" });
  useEffect(() => { getCalendarioGeral().then(({ config: dados, error }) => { if (error) showToast("Não foi possível carregar o calendário geral.", "error"); if (dados) { setConfig(dados); setForm({ dia_boleto: dados.dia_boleto, titulo: dados.titulo, mensagem: dados.mensagem, numeros_suporte: dados.numeros_suporte }); } }); }, [showToast]);
  const dias = useMemo(() => eachDayOfInterval({ start: startOfMonth(startOfToday()), end: endOfMonth(startOfToday()) }), []);
  const salvar = async (event: React.FormEvent) => { event.preventDefault(); setSalvando(true); const { error } = await atualizarCalendarioGeral(form); setSalvando(false); if (error) return showToast(error, "error"); setConfig((atual) => atual ? { ...atual, ...form } : atual); setEditando(false); showToast("Calendário geral atualizado.", "success"); };
  const dados = config || form;
  return <div className="calendario-geral-page">{isRematricula ? <RematriculaTabs /> : <EngajamentoTabs />}<div className="calendario-geral-header"><div><h1><CalendarDays size={22} /> Calendário geral</h1><p>Comunicados operacionais compartilhados com toda a equipe de Engajamento.</p></div>{user?.role === "admin" && !editando && <button className="btn btn-primary" onClick={() => setEditando(true)}><Edit3 size={17} /> Editar calendário</button>}</div>
    <section className="calendario-geral-conteudo"><div className="calendario-geral-mes"><h2>{format(startOfToday(), "MMMM 'de' yyyy", { locale: ptBR })}</h2><div className="calendario-geral-grade">{dias.map((dia) => <div key={dia.toISOString()} className={`${isSameDay(dia, startOfToday()) ? "hoje" : ""} ${format(dia, "d") === String(dados.dia_boleto) ? "evento" : ""}`}><span>{format(dia, "d")}</span>{format(dia, "d") === String(dados.dia_boleto) && <small>Boleto</small>}</div>)}</div></div>
      <div className="calendario-geral-evento"><span className="calendario-geral-etiqueta">Todo dia {dados.dia_boleto}</span><h2><Ticket size={19} /> {dados.titulo}</h2><p>{dados.mensagem}</p><div className="calendario-geral-suporte"><Phone size={17} /><div><strong>Suporte</strong><span>{dados.numeros_suporte || "Números de suporte ainda não configurados pelo administrador."}</span></div></div><p className="calendario-geral-nota">No dia configurado, todos os colaboradores de Engajamento recebem este lembrete pelo sininho.</p></div></section>
    {editando && <div className="modal-overlay" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setEditando(false); }}><form className="calendario-geral-modal" onSubmit={salvar} onClick={(event) => event.stopPropagation()}><h2>Editar lembrete de boleto</h2><label>Dia do mês<input type="number" min="1" max="28" value={form.dia_boleto} onChange={(event) => setForm({ ...form, dia_boleto: Number(event.target.value) })} required /></label><label>Título<input value={form.titulo} onChange={(event) => setForm({ ...form, titulo: event.target.value })} maxLength={255} required /></label><label>Mensagem<textarea value={form.mensagem} onChange={(event) => setForm({ ...form, mensagem: event.target.value })} rows={3} required /></label><label>Números/canais de suporte<textarea value={form.numeros_suporte} onChange={(event) => setForm({ ...form, numeros_suporte: event.target.value })} placeholder="Ex.: Financeiro: (11) 99999-9999 · Acadêmico: (11) 98888-8888" rows={2} /></label><div><button type="button" className="btn btn-secondary" onClick={() => setEditando(false)}>Cancelar</button><button className="btn btn-primary" disabled={salvando}><Save size={16} /> {salvando ? "Salvando..." : "Salvar"}</button></div></form></div>}
  </div>;
};
export default CalendarioGeral;
