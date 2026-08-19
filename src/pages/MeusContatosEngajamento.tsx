import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import KanbanBoard from "../components/kanban/KanbanBoard";
import EngajamentoTabs from "../components/EngajamentoTabs";
import "./MeusContatos.css";

// "Meus Contatos" do Engajamento: mesmo padrão de src/pages/MeusContatos.tsx
// (Rematrícula), reaproveitando o Kanban do Engajamento filtrado só pelos
// alunos em que o colaborador logado é o responsável (assignedTo === user.id).
//
// Diferente da Rematrícula, aqui existe também o botão "Novo Contato": ao
// contrário do "Novo Aluno" da aba Alunos (que sempre entra sem
// responsável, pra ser assumido depois — ver Engajamento.tsx), o contato
// criado por aqui já nasce atribuído a quem está criando (?paraMim=1 no
// AlunoForm), porque o colaborador já está dentro do próprio funil.
const MeusContatosEngajamento: React.FC = () => {
  const { filteredAlunos } = useAlunos();
  const { user } = useAuth();
  const navigate = useNavigate();

  const totalMeus = useMemo(
    () =>
      filteredAlunos.filter(
        (a) => a.area === "engajamento" && a.assignedTo === user?.id
      ).length,
    [filteredAlunos, user]
  );

  return (
    <div className="meus-contatos-page">
      {/* Abas da seção Engajamento (Alunos / Meus Contatos) */}
      <EngajamentoTabs />

      <div className="meus-contatos-header">
        <div>
          <h1>Meus Contatos</h1>
          <p className="meus-contatos-subtitle">
            {totalMeus} {totalMeus === 1 ? "aluno sob sua responsabilidade" : "alunos sob sua responsabilidade"}
          </p>
        </div>
        <div className="meus-contatos-actions">
          <button
            className="btn btn-primary"
            onClick={() => navigate("/engajamento/novo?paraMim=1")}
          >
            <Plus size={18} />
            Novo Contato
          </button>
        </div>
      </div>

      <KanbanBoard area="engajamento" onlyMine />
    </div>
  );
};

export default MeusContatosEngajamento;
