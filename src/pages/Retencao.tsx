import React, { useState } from "react";
import { useAlunos } from "../hooks/useAlunos";
import { Search, LifeBuoy } from "lucide-react";
import KanbanBoard from "../components/kanban/KanbanBoard";
import "./Alunos.css";

/**
 * Funil de Retenção: recebe automaticamente quem foi marcado como
 * "desistente" na Rematrícula (via trigger no banco). Não tem cadastro
 * manual — por isso, diferente de /alunos e /engajamento, esta página não
 * tem botão "Novo Aluno". Ver README.md seção 1.
 */
const Retencao: React.FC = () => {
  const { alunos, filters, setFilters } = useAlunos();
  const [searchTerm, setSearchTerm] = useState(filters.search || "");

  const totalRetencao = alunos.filter((a) => a.area === "retencao").length;

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setFilters({ ...filters, search: value });
  };

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
        <div className="search-box">
          <Search size={20} />
          <input
            type="text"
            placeholder="Buscar por nome, email, RA, curso..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </div>

      <KanbanBoard area="retencao" />
    </div>
  );
};

export default Retencao;
