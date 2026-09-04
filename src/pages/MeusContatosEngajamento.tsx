import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import SearchBox from "../components/SearchBox";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import KanbanBoard from "../components/kanban/KanbanBoard";
import EngajamentoTabs from "../components/EngajamentoTabs";
import "./MeusContatos.css";

const MeusContatosEngajamento: React.FC = () => {
  const { filteredAlunos, colaboradores } = useAlunos();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  const totalMeus = useMemo(
    () =>
      filteredAlunos.filter(
        (a) => a.area === "engajamento" && a.assignedTo === user?.id
      ).length,
    [filteredAlunos, user]
  );

  const outrosEncontrados = useMemo(() => {
    const termo = searchTerm.trim().toLowerCase();
    if (!termo || !user) return [];

    return filteredAlunos
      .filter((a) => {
        if (a.area !== "engajamento") return false;
        if (a.assignedTo === user.id) return false;
        const alvo =
          `${a.name} ${a.email ?? ""} ${a.phone ?? ""} ${a.ra ?? ""}`.toLowerCase();
        return alvo.includes(termo);
      })
      .slice(0, 8);
  }, [filteredAlunos, searchTerm, user]);

  return (
    <div className="meus-contatos-page">
      <EngajamentoTabs />

      <div className="meus-contatos-header">
        <div>
          <h1>Meus Contatos</h1>
          <p className="meus-contatos-subtitle">
            {totalMeus}{" "}
            {totalMeus === 1
              ? "aluno sob sua responsabilidade"
              : "alunos sob sua responsabilidade"}
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

      <SearchBox
        placeholder="Buscar nos meus contatos..."
        value={searchTerm}
        onChange={setSearchTerm}
        maxWidth="360px"
      />

      {outrosEncontrados.length > 0 && (
        <div className="meus-contatos-outros" role="status">
          <strong>
            {outrosEncontrados.length === 1
              ? "1 contato encontrado fora da sua carteira"
              : `${outrosEncontrados.length} contatos encontrados fora da sua carteira`}
          </strong>
          <ul>
            {outrosEncontrados.map((a) => {
              const resp =
                colaboradores.find((c) => c.id === a.assignedTo)?.name ||
                (a.assignedTo ? "outro colaborador" : "sem responsável");
              return (
                <li key={a.id}>
                  <span className="meus-contatos-outros-nome">{a.name}</span>
                  {a.ra ? (
                    <span className="meus-contatos-outros-meta">RA {a.ra}</span>
                  ) : null}
                  <span className="meus-contatos-outros-meta">· {resp}</span>
                </li>
              );
            })}
          </ul>
          <p className="meus-contatos-outros-hint">
            O contato já existe no polo. Não cadastre de novo — peça delegação
            ou fale com o responsável.
          </p>
        </div>
      )}

      <KanbanBoard area="engajamento" onlyMine searchTerm={searchTerm} />
    </div>
  );
};

export default MeusContatosEngajamento;
