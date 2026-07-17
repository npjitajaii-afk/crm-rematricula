import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import { AlunoStatus } from "../types";
import {
  ArrowLeft,
  Mail,
  Phone,
  GraduationCap,
  Clock,
  Calendar,
  AlertCircle,
  Tag,
  MessageSquare,
  Plus,
  Edit2,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import {
  formatCurrency,
  formatDateTime,
  getStatusLabel,
  getSourceLabel,
  getStatusColor,
} from "../utils/formatters";
import "./AlunoDetails.css";

const AlunoDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getAluno, addInteraction, updateAluno, deleteAluno, assumirAluno, delegarAluno, isAdmin, colaboradores } = useAlunos();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [aluno, setAluno] = useState(getAluno(id!));
  const [showInteractionForm, setShowInteractionForm] = useState(false);
  const [interactionType, setInteractionType] = useState<string>("nota");
  const [interactionDescription, setInteractionDescription] = useState("");

  useEffect(() => {
    setAluno(getAluno(id!));
  }, [id, getAluno]);

  if (!aluno) {
    return (
      <div className="lead-details-container">
        <div className="error-state">
          <h2>Aluno não encontrado</h2>
          <button
            className="btn btn-primary"
            onClick={() => navigate("/dashboard")}
          >
            <ArrowLeft size={20} />
            Voltar ao Dashboard
          </button>
        </div>
      </div>
    );
  }

  const handleAddInteraction = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!interactionDescription.trim() || !user) return;

    try {
      await addInteraction(aluno.id, {
        type: interactionType as
          | "email"
          | "telefone"
          | "whatsapp"
          | "presencial"
          | "nota"
          | "outro",
        description: interactionDescription,
        date: new Date(),
        userId: user.id,
        userName: user.name,
      });

      setInteractionDescription("");
      setShowInteractionForm(false);

      const updatedAluno = getAluno(id!);
      if (updatedAluno) setAluno(updatedAluno);
    } catch (error) {
      console.error("Erro ao adicionar interação:", error);
      showToast("Erro ao adicionar interação. Tente novamente.", "error");
    }
  };

  const handleStatusChange = async (newStatus: AlunoStatus) => {
    try {
      await updateAluno(aluno.id, { status: newStatus });

      const updatedAluno = getAluno(id!);
      if (updatedAluno) setAluno(updatedAluno);
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      showToast("Erro ao atualizar status. Tente novamente.", "error");
    }
  };

  const handleEdit = () => {
    navigate(`/alunos/${id}/edit`);
  };

  const handleDelete = async () => {
    const confirmed = await confirm(
      `Tem certeza que deseja excluir o aluno "${aluno.name}"?`,
      { confirmLabel: "Excluir" }
    );
    if (!confirmed) return;

    try {
      await deleteAluno(aluno.id);
      showToast("Aluno excluído com sucesso!", "success");
      navigate("/dashboard");
    } catch (error) {
      console.error("Erro ao excluir aluno:", error);
      showToast("Erro ao excluir aluno. Tente novamente.", "error");
    }
  };

  const isOwner = aluno.assignedTo === user?.id;
  const semResponsavel = !aluno.assignedTo;
  const podeEditar = isAdmin || isOwner;

  const handleAssumir = async () => {
    try {
      await assumirAluno(aluno.id);
      const updatedAluno = getAluno(id!);
      if (updatedAluno) setAluno(updatedAluno);
    } catch (error) {
      console.error("Erro ao assumir contato:", error);
      showToast("Erro ao assumir contato. Tente novamente.", "error");
    }
  };

  const handleDelegar = async (colaboradorId: string) => {
    if (!colaboradorId) return;
    try {
      await delegarAluno(aluno.id, colaboradorId);
      const updatedAluno = getAluno(id!);
      if (updatedAluno) setAluno(updatedAluno);
    } catch (error) {
      console.error("Erro ao delegar contato:", error);
      showToast("Erro ao delegar contato. Tente novamente.", "error");
    }
  };

  return (
    <div className="lead-details-container">
      {/* Header */}
      <div className="lead-details-header">
        <button
          className="btn btn-secondary"
          onClick={() => navigate("/dashboard")}
        >
          <ArrowLeft size={20} />
          <span>Voltar</span>
        </button>

        <div className="header-actions">
          {!isAdmin && semResponsavel && (
            <button className="btn btn-primary" onClick={handleAssumir}>
              <UserPlus size={18} />
              <span>Assumir contato</span>
            </button>
          )}
          {podeEditar && (
            <button className="btn btn-secondary" onClick={handleEdit}>
              <Edit2 size={18} />
              <span>Editar</span>
            </button>
          )}
          {podeEditar && (
            <button className="btn btn-danger" onClick={handleDelete}>
              <Trash2 size={18} />
              <span>Excluir</span>
            </button>
          )}
        </div>
      </div>

      <div className="lead-details-content">
        {/* Coluna Principal */}
        <div className="lead-main-column">
          {/* Card de Informações */}
          <div className="card lead-info-card">
            <div className="lead-info-header">
              <div>
                <h1>{aluno.name}</h1>
                <div className="lead-meta">
                  <span className="meta-item">
                    <Calendar size={14} />
                    Criado em {formatDateTime(aluno.createdAt)}
                  </span>
                </div>
              </div>
              <div
                className="status-badge"
                style={{ backgroundColor: getStatusColor(aluno.status) }}
              >
                {getStatusLabel(aluno.status)}
              </div>
            </div>

            <div className="lead-info-grid">
              <div className="info-item">
                <Mail size={18} />
                <div>
                  <span className="info-label">E-mail</span>
                  <a href={`mailto:${aluno.email}`} className="info-value">
                    {aluno.email}
                  </a>
                </div>
              </div>

              <div className="info-item">
                <Phone size={18} />
                <div>
                  <span className="info-label">Telefone</span>
                  <a href={`tel:${aluno.phone}`} className="info-value">
                    {aluno.phone}
                  </a>
                </div>
              </div>

              {aluno.ra && (
                <div className="info-item">
                  <Tag size={18} />
                  <div>
                    <span className="info-label">RA / Matrícula</span>
                    <span className="info-value">{aluno.ra}</span>
                  </div>
                </div>
              )}

              {aluno.curso && (
                <div className="info-item">
                  <GraduationCap size={18} />
                  <div>
                    <span className="info-label">Curso</span>
                    <span className="info-value">
                      {aluno.curso}
                      {aluno.turno ? ` · ${aluno.turno}` : ""}
                    </span>
                  </div>
                </div>
              )}

              {!!aluno.value && (
                <div className="info-item">
                  <AlertCircle size={18} />
                  <div>
                    <span className="info-label">Débito Pendente</span>
                    <span className="info-value">
                      {formatCurrency(aluno.value)}
                    </span>
                  </div>
                </div>
              )}

              <div className="info-item">
                <Clock size={18} />
                <div>
                  <span className="info-label">Canal de Contato</span>
                  <span className="info-value">
                    {getSourceLabel(aluno.source)}
                  </span>
                </div>
              </div>
            </div>

            {aluno.tags && aluno.tags.length > 0 && (
              <div className="lead-tags-section">
                <span className="info-label">Tags:</span>
                <div className="lead-tags">
                  {aluno.tags.map((tag, index) => (
                    <span key={index} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {aluno.observations && (
              <div className="lead-observations">
                <span className="info-label">Observações:</span>
                <p>{aluno.observations}</p>
              </div>
            )}
          </div>

          {/* Histórico de Interações */}
          <div className="card interactions-card">
            <div className="interactions-header">
              <h2>
                <MessageSquare size={20} />
                Histórico de Interações
              </h2>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowInteractionForm(!showInteractionForm)}
              >
                <Plus size={18} />
                Nova Interação
              </button>
            </div>

            {showInteractionForm && (
              <form
                onSubmit={handleAddInteraction}
                className="interaction-form"
              >
                <div className="form-group">
                  <label htmlFor="type">Tipo de Interação</label>
                  <select
                    id="type"
                    value={interactionType}
                    onChange={(e) => setInteractionType(e.target.value)}
                    required
                  >
                    <option value="nota">Nota</option>
                    <option value="email">E-mail</option>
                    <option value="telefone">Telefone</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="presencial">Presencial</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="description">Descrição</label>
                  <textarea
                    id="description"
                    value={interactionDescription}
                    onChange={(e) => setInteractionDescription(e.target.value)}
                    placeholder="Descreva a interação..."
                    required
                    rows={4}
                  />
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowInteractionForm(false)}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Adicionar Interação
                  </button>
                </div>
              </form>
            )}

            <div className="interactions-timeline">
              {aluno.interactions.length === 0 ? (
                <div className="empty-state">
                  <MessageSquare size={48} />
                  <p>Nenhuma interação registrada ainda</p>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowInteractionForm(true)}
                  >
                    Adicionar primeira interação
                  </button>
                </div>
              ) : (
                aluno.interactions
                  .sort(
                    (a, b) =>
                      new Date(b.date).getTime() - new Date(a.date).getTime()
                  )
                  .map((interaction) => (
                    <div key={interaction.id} className="interaction-item">
                      <div className="interaction-icon">
                        <MessageSquare size={16} />
                      </div>
                      <div className="interaction-content">
                        <div className="interaction-header">
                          <span className="interaction-type">
                            {interaction.type}
                          </span>
                          <span className="interaction-date">
                            {formatDateTime(interaction.date)}
                          </span>
                        </div>
                        <p className="interaction-description">
                          {interaction.description}
                        </p>
                        <span className="interaction-user">
                          Por: {interaction.userName}
                        </span>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lead-sidebar">
          {/* Card de Status */}
          <div className="card">
            <h3>Alterar Status</h3>
            <div className="status-options">
              {(
                [
                  "pendente",
                  "contatado",
                  "aguardando_retorno",
                  "confirmado",
                  "documentacao",
                  "rematriculado",
                  "desistente",
                ] as const
              ).map((status) => (
                <button
                  key={status}
                  className={`status-option ${
                    aluno.status === status ? "active" : ""
                  }`}
                  style={{
                    borderLeftColor: getStatusColor(status),
                    backgroundColor:
                      aluno.status === status
                        ? `${getStatusColor(status)}15`
                        : "transparent",
                  }}
                  onClick={() => handleStatusChange(status)}
                >
                  {getStatusLabel(status)}
                </button>
              ))}
            </div>
          </div>

          {/* Card de Estatísticas */}
          <div className="card">
            <h3>Estatísticas</h3>
            <div className="stats-list">
              <div className="stat-item">
                <span className="stat-label">Total de Interações</span>
                <span className="stat-value">
                  {aluno.interactions.length}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Última Atualização</span>
                <span className="stat-value">
                  {formatDateTime(aluno.updatedAt)}
                </span>
              </div>
            </div>
          </div>

          {/* Card de Delegação (só admin) */}
          {isAdmin && (
            <div className="card">
              <h3>
                <Users size={18} style={{ marginRight: "0.375rem" }} />
                Delegar Contato
              </h3>
              <div className="form-group">
                <select
                  value={aluno.assignedTo || ""}
                  onChange={(e) => handleDelegar(e.target.value)}
                >
                  <option value="" disabled>
                    {semResponsavel ? "Sem responsável" : "Selecione um colaborador"}
                  </option>
                  {colaboradores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AlunoDetails;