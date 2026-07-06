import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAlunos } from "../hooks/useAlunos";
import { AlunoStatus } from "../types";
import {
  UsersRound,
  Search,
  ChevronDown,
  ChevronUp,
  Eye,
  Edit,
  Mail,
  Phone,
  GraduationCap,
  AlertCircle,
  UserX,
} from "lucide-react";
import {
  formatCurrency,
  formatDate,
  getStatusColor,
  getStatusLabel,
} from "../utils/formatters";
import "./Colaboradores.css";

const STATUS_LIST = [
  { value: "pendente", label: "Pendente" },
  { value: "contatado", label: "Contatado" },
  { value: "aguardando_retorno", label: "Aguardando" },
  { value: "confirmado", label: "Confirmado" },
  { value: "documentacao", label: "Documentação" },
  { value: "rematriculado", label: "Rematriculado" },
  { value: "desistente", label: "Desistente" },
];

const Colaboradores: React.FC = () => {
  const { alunos, colaboradores } = useAlunos();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [expandedColaborador, setExpandedColaborador] = useState<string | null>(null);

  // Monta visão por colaborador
  const colaboradoresData = useMemo(() => {
    const map: Record<
      string,
      { id: string; name: string; email: string; alunos: typeof alunos }
    > = {};

    // Inicializa todos os colaboradores registrados
    colaboradores.forEach((c) => {
      map[c.id] = { ...c, alunos: [] };
    });

    // Distribui os alunos
    alunos.forEach((a) => {
      if (a.assignedTo && map[a.assignedTo]) {
        map[a.assignedTo].alunos.push(a);
      }
    });

    return Object.values(map);
  }, [alunos, colaboradores]);

  // Alunos sem responsável
  const semResponsavel = useMemo(
    () => alunos.filter((a) => !a.assignedTo),
    [alunos]
  );

  const filteredColaboradores = useMemo(
    () =>
      colaboradoresData.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.email.toLowerCase().includes(search.toLowerCase())
      ),
    [colaboradoresData, search]
  );

  const toggle = (id: string) =>
    setExpandedColaborador((prev) => (prev === id ? null : id));

  const getResumo = (alunosList: typeof alunos) => {
    const totals: Record<string, number> = {};
    alunosList.forEach((a) => {
      totals[a.status] = (totals[a.status] || 0) + 1;
    });
    return totals;
  };

  return (
    <div className="colab-page">
      <div className="colab-header">
        <div>
          <h1>Colaboradores</h1>
          <p className="colab-subtitle">
            Visão da área de trabalho de cada colaborador
          </p>
        </div>
        <div className="colab-header-stats">
          <div className="colab-stat-chip">
            <UsersRound size={16} />
            {colaboradoresData.length} colaboradores
          </div>
          <div className="colab-stat-chip sem-responsavel">
            <UserX size={16} />
            {semResponsavel.length} sem responsável
          </div>
        </div>
      </div>

      {/* Busca */}
      <div className="colab-search-wrapper">
        <Search size={16} className="colab-search-icon" />
        <input
          className="colab-search"
          placeholder="Buscar colaborador..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Cards de colaboradores */}
      <div className="colab-list">
        {filteredColaboradores.map((colab) => {
          const resumo = getResumo(colab.alunos);
          const isOpen = expandedColaborador === colab.id;
          const rematriculados = resumo["rematriculado"] || 0;
          const taxa =
            colab.alunos.length > 0
              ? Math.round((rematriculados / colab.alunos.length) * 100)
              : 0;

          return (
            <div key={colab.id} className={`colab-card ${isOpen ? "open" : ""}`}>
              {/* Cabeçalho do colaborador */}
              <div className="colab-card-header" onClick={() => toggle(colab.id)}>
                <div className="colab-identity">
                  <div className="colab-avatar">
                    {colab.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="colab-name">{colab.name}</p>
                    <p className="colab-email">{colab.email}</p>
                  </div>
                </div>

                <div className="colab-card-meta">
                  {/* Mini pipeline por status */}
                  <div className="colab-status-row">
                    {STATUS_LIST.map((s) =>
                      resumo[s.value] ? (
                        <span
                          key={s.value}
                          className="colab-status-chip"
                          style={{
                            backgroundColor: getStatusColor(s.value as AlunoStatus) + "22",
                            color: getStatusColor(s.value as AlunoStatus),
                            borderColor: getStatusColor(s.value as AlunoStatus) + "55",
                          }}
                          title={getStatusLabel(s.value)}
                        >
                          {resumo[s.value]} {s.label}
                        </span>
                      ) : null
                    )}
                  </div>

                  <div className="colab-numbers">
                    <span className="colab-total">{colab.alunos.length} contatos</span>
                    {colab.alunos.length > 0 && (
                      <span className="colab-taxa" style={{ color: taxa >= 50 ? "#15803d" : "var(--primary)" }}>
                        {taxa}% rematric.
                      </span>
                    )}
                  </div>

                  <button className="colab-toggle-btn">
                    {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                </div>
              </div>

              {/* Tabela expandida */}
              {isOpen && (
                <div className="colab-card-body">
                  {colab.alunos.length === 0 ? (
                    <div className="colab-empty">
                      <p>Nenhum contato atribuído a este colaborador.</p>
                    </div>
                  ) : (
                    <table className="colab-table">
                      <thead>
                        <tr>
                          <th>Aluno</th>
                          <th>Curso</th>
                          <th>Contato</th>
                          <th>Status</th>
                          <th>Valor</th>
                          <th>Criado em</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {colab.alunos.map((aluno) => (
                          <tr key={aluno.id}>
                            <td>
                              <div className="aluno-name-cell">
                                <span className="aluno-name">{aluno.name}</span>
                                {aluno.ra && <span className="aluno-ra">RA: {aluno.ra}</span>}
                              </div>
                            </td>
                            <td>
                              {aluno.curso ? (
                                <div className="curso-cell">
                                  <GraduationCap size={13} />
                                  <span>{aluno.curso}{aluno.turno ? ` · ${aluno.turno}` : ""}</span>
                                </div>
                              ) : <span className="text-muted">—</span>}
                            </td>
                            <td>
                              <div className="contato-cell">
                                <div className="contato-item"><Mail size={12} /><span>{aluno.email}</span></div>
                                <div className="contato-item"><Phone size={12} /><span>{aluno.phone}</span></div>
                              </div>
                            </td>
                            <td>
                              <span
                                className="status-badge"
                                style={{
                                  backgroundColor: getStatusColor(aluno.status) + "22",
                                  color: getStatusColor(aluno.status),
                                  borderColor: getStatusColor(aluno.status) + "55",
                                }}
                              >
                                {getStatusLabel(aluno.status)}
                              </span>
                            </td>
                            <td>
                              {aluno.value ? (
                                <div className="valor-cell">
                                  <AlertCircle size={12} />
                                  <span>{formatCurrency(aluno.value)}</span>
                                </div>
                              ) : <span className="text-muted">—</span>}
                            </td>
                            <td><span className="date-cell">{formatDate(aluno.createdAt)}</span></td>
                            <td>
                              <div className="acoes-cell">
                                <button
                                  className="action-btn action-btn-view"
                                  title="Ver detalhes"
                                  onClick={() => navigate(`/alunos/${aluno.id}`)}
                                >
                                  <Eye size={14} />
                                </button>
                                <button
                                  className="action-btn action-btn-edit"
                                  title="Editar"
                                  onClick={() => navigate(`/alunos/${aluno.id}/edit`)}
                                >
                                  <Edit size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Seção: sem responsável */}
        {semResponsavel.length > 0 && (
          <div className={`colab-card sem-resp-card ${expandedColaborador === "__sem__" ? "open" : ""}`}>
            <div className="colab-card-header" onClick={() => toggle("__sem__")}>
              <div className="colab-identity">
                <div className="colab-avatar colab-avatar-sem">
                  <UserX size={18} />
                </div>
                <div>
                  <p className="colab-name">Sem Responsável</p>
                  <p className="colab-email">Contatos ainda não atribuídos</p>
                </div>
              </div>
              <div className="colab-card-meta">
                <span className="colab-total">{semResponsavel.length} contatos</span>
                <button className="colab-toggle-btn">
                  {expandedColaborador === "__sem__" ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>
            </div>

            {expandedColaborador === "__sem__" && (
              <div className="colab-card-body">
                <table className="colab-table">
                  <thead>
                    <tr>
                      <th>Aluno</th>
                      <th>Curso</th>
                      <th>Contato</th>
                      <th>Status</th>
                      <th>Valor</th>
                      <th>Criado em</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {semResponsavel.map((aluno) => (
                      <tr key={aluno.id}>
                        <td>
                          <div className="aluno-name-cell">
                            <span className="aluno-name">{aluno.name}</span>
                            {aluno.ra && <span className="aluno-ra">RA: {aluno.ra}</span>}
                          </div>
                        </td>
                        <td>
                          {aluno.curso ? (
                            <div className="curso-cell">
                              <GraduationCap size={13} />
                              <span>{aluno.curso}{aluno.turno ? ` · ${aluno.turno}` : ""}</span>
                            </div>
                          ) : <span className="text-muted">—</span>}
                        </td>
                        <td>
                          <div className="contato-cell">
                            <div className="contato-item"><Mail size={12} /><span>{aluno.email}</span></div>
                            <div className="contato-item"><Phone size={12} /><span>{aluno.phone}</span></div>
                          </div>
                        </td>
                        <td>
                          <span
                            className="status-badge"
                            style={{
                              backgroundColor: getStatusColor(aluno.status) + "22",
                              color: getStatusColor(aluno.status),
                              borderColor: getStatusColor(aluno.status) + "55",
                            }}
                          >
                            {getStatusLabel(aluno.status)}
                          </span>
                        </td>
                        <td>
                          {aluno.value ? (
                            <div className="valor-cell">
                              <AlertCircle size={12} />
                              <span>{formatCurrency(aluno.value)}</span>
                            </div>
                          ) : <span className="text-muted">—</span>}
                        </td>
                        <td><span className="date-cell">{formatDate(aluno.createdAt)}</span></td>
                        <td>
                          <div className="acoes-cell">
                            <button
                              className="action-btn action-btn-view"
                              title="Ver detalhes"
                              onClick={() => navigate(`/alunos/${aluno.id}`)}
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              className="action-btn action-btn-edit"
                              title="Editar"
                              onClick={() => navigate(`/alunos/${aluno.id}/edit`)}
                            >
                              <Edit size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Colaboradores;
