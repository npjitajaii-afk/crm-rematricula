import React, { useState } from "react";
import { useAlunos } from "../hooks/useAlunos";
import { LifeBuoy } from "lucide-react";
import SearchBox from "../components/SearchBox";
import KanbanBoard from "../components/kanban/KanbanBoard";
import "./Alunos.css";

/**
 * Funil de Retenção: recebe automaticamente quem foi marcado como
 * "desistente" na Rematrícula (via trigger no banco). Não tem cadastro
 * manual — por isso, diferente de /alunos e /engajamento, esta página não
 * tem botão "Novo Aluno". Ver README.md seção 1.
 *
 * Busca e filtros são 100% locais (SCOPE_ID) — não gravam no AlunosContext
 * e portanto não interferem em Rematrícula, Engajamento ou Meus Contatos.
 */
const SCOPE_ID = "retencao";

const Retencao: React.FC = () => {
  const { alunos } = useAlunos();
  // Busca LOCAL — isolada das demais abas.
  const [searchTerm, setSearchTerm] = useState("");

  const totalRetencao = alunos.filter((a) => a.area === "retencao").length;

  return (
    <div className="leads-page">
      <div className="leads-header">
        <div>
          <h1>
            <LifeBuoy size={22} style={{ verticalAlign: "text-bottom", marginRight: 8 }} />
            Retenção
          </h1>
          <p className="leads-subtitle">
            {totalRetencao} {totalRetencao === 1 ? "aluno" : "alunos"} em
            tratativa de reversão de evasão
          </p>
        </div>
      </div>

      <div className="leads-toolbar">
        <SearchBox
          id={`search-${SCOPE_ID}`}
          placeholder="Buscar por nome, email, RA, curso..."
          value={searchTerm}
          onChange={setSearchTerm}
        />
      </div>

      <KanbanBoard area="retencao" searchTerm={searchTerm} />
    </div>
  );
};

export default Retencao;
