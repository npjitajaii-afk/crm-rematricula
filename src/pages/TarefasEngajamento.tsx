import React, { useMemo, useState } from "react";
import { Check, CheckCircle2, Circle, Clock3, Plus, UserRound } from "lucide-react";
import { format, isPast, startOfToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import EngajamentoTabs from "../components/EngajamentoTabs";
import RematriculaTabs from "../components/RematriculaTabs";
import TarefaModal from "../components/TarefaModal";
import { useAlunos } from "../hooks/useAlunos";
import { useTarefasEngajamento } from "../hooks/useTarefasEngajamento";
import { TarefaPessoal } from "../types";
import "./TarefasEngajamento.css";

type Filtro = "pendentes" | "concluidas" | "todas";

const TarefasEngajamento: React.FC<{ area?: "engajamento" | "rematricula" }> = ({ area = "engajamento" }) => {
  const { tarefas, isLoading, atualizarTarefa } = useTarefasEngajamento();
  const { alunos, isAdmin } = useAlunos();
  const [filtro, setFiltro] = useState<Filtro>("pendentes");
  const [modalAberto, setModalAberto] = useState(false);
  const [tarefaSelecionadaId, setTarefaSelecionadaId] = useState<string>();
  const tarefaSelecionada = tarefaSelecionadaId
    ? tarefas.find((t) => t.id === tarefaSelecionadaId)
    : undefined;

  const alunosEngajamento = useMemo(() => alunos.filter((aluno) => aluno.area === area).map((aluno) => ({ id: aluno.id, name: aluno.name })).sort((a, b) => a.name.localeCompare(b.name)), [alunos, area]);
  const tarefasExibidas = useMemo(() => tarefas.filter((tarefa) => filtro === "todas" || (filtro === "pendentes" ? tarefa.status === "em_andamento" : tarefa.status === "concluido")).sort((a, b) => {
    if (a.status !== b.status) return a.status === "em_andamento" ? -1 : 1;
    if (!a.prazo) return 1;
    if (!b.prazo) return -1;
    return a.prazo.getTime() - b.prazo.getTime();
  }), [filtro, tarefas]);

  const abrirNova = () => { setTarefaSelecionadaId(undefined); setModalAberto(true); };
  const concluir = async (event: React.MouseEvent, tarefa: TarefaPessoal) => {
    event.stopPropagation();
    await atualizarTarefa(tarefa.id, { status: tarefa.status === "concluido" ? "em_andamento" : "concluido" });
  };

  return <div className="tarefas-page">
    {area === "rematricula" ? <RematriculaTabs /> : <EngajamentoTabs />}
    <div className="tarefas-header"><div><h1><CheckCircle2 size={22} /> Tarefas</h1><p>Organize seus acompanhamentos, com ou sem aluno e prazo vinculados.</p></div><button className="btn btn-primary" onClick={abrirNova}><Plus size={18} /> Nova tarefa</button></div>
    <div className="tarefas-filtros" role="tablist" aria-label="Filtrar tarefas">
      {(["pendentes", "concluidas", "todas"] as Filtro[]).map((opcao) => <button key={opcao} className={filtro === opcao ? "active" : ""} onClick={() => setFiltro(opcao)}>{opcao === "pendentes" ? "Pendentes" : opcao === "concluidas" ? "Concluídas" : "Todas"}</button>)}
    </div>
    {isLoading ? <div className="tarefas-vazio">Carregando tarefas...</div> : tarefasExibidas.length === 0 ? <div className="tarefas-vazio"><CheckCircle2 size={34} /><h2>Nenhuma tarefa por aqui</h2><p>Crie uma tarefa para acompanhar uma atividade ou um aluno.</p><button className="btn btn-primary" onClick={abrirNova}><Plus size={17} /> Criar tarefa</button></div> : <div className="tarefas-lista">
      {tarefasExibidas.map((tarefa) => {
        const atrasada = tarefa.status === "em_andamento" && tarefa.prazo && isPast(tarefa.prazo) && tarefa.prazo < startOfToday();
        return <article key={tarefa.id} className={`tarefa-card ${tarefa.status === "concluido" ? "concluida" : ""}`} onClick={() => { setTarefaSelecionadaId(tarefa.id); setModalAberto(true); }}><button className="tarefa-status" onClick={(event) => concluir(event, tarefa)} aria-label={tarefa.status === "concluido" ? "Reabrir tarefa" : "Concluir tarefa"}>{tarefa.status === "concluido" ? <Check size={16} /> : <Circle size={18} />}</button><div className="tarefa-conteudo"><h2>{tarefa.titulo}</h2>{tarefa.anotacoes && <p>{tarefa.anotacoes}</p>}<div className="tarefa-metadados">{tarefa.alunoNome && <span><UserRound size={14} /> {tarefa.alunoNome}</span>}{tarefa.prazo && <span className={atrasada ? "atrasada" : ""}><Clock3 size={14} /> {atrasada ? "Atrasada: " : ""}{format(tarefa.prazo, "dd 'de' MMM", { locale: ptBR })}</span>}</div></div></article>;
      })}
    </div>}
    {modalAberto && <TarefaModal onClose={() => setModalAberto(false)} tarefa={tarefaSelecionada} alunos={alunosEngajamento} isAdmin={isAdmin} />}
  </div>;
};

export default TarefasEngajamento;
