import React from "react";
import { Aluno } from "../../types";
import { Mail, Phone, GraduationCap, AlertCircle, UserPlus } from "lucide-react";
import {
  formatCurrency,
  formatDate,
  getTipoAlunoColor,
} from "../../utils/formatters";
import { useNavigate } from "react-router-dom";
import { useAlunos } from "../../hooks/useAlunos";
import "./AlunoCard.css";

interface AlunoCardProps {
  aluno: Aluno;
}

const AlunoCard: React.FC<AlunoCardProps> = ({ aluno }) => {
  const navigate = useNavigate();
  const { isAdmin, assumirAluno } = useAlunos();

  const handleClick = () => {
    navigate(`/alunos/${aluno.id}`);
  };

  const handleAssumir = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await assumirAluno(aluno.id);
    } catch {
      alert("Erro ao assumir contato. Tente novamente.");
    }
  };

  const semResponsavel = !aluno.assignedTo;

  const TIPOS_ALUNO = ["Calouro", "Veterano", "Winback"];
  const tipoAluno = aluno.tags?.find((t) => TIPOS_ALUNO.includes(t));
  const outrasTags = aluno.tags?.filter((t) => t !== tipoAluno) || [];

  return (
    <div className="lead-card" onClick={handleClick}>
      <div className="lead-card-header">
        <h4 className="lead-name">{aluno.name}</h4>
        {!!aluno.value && (
          <span className="lead-value">{formatCurrency(aluno.value)}</span>
        )}
      </div>

      {tipoAluno && (
        <span
          className="lead-tipo-badge"
          style={{ backgroundColor: getTipoAlunoColor(tipoAluno) }}
        >
          {tipoAluno}
        </span>
      )}

      <div className="lead-card-body">
        {aluno.curso && (
          <div className="lead-info">
            <GraduationCap size={14} />
            <span>
              {aluno.curso}
              {aluno.turno ? ` · ${aluno.turno}` : ""}
            </span>
          </div>
        )}

        <div className="lead-info">
          <Mail size={14} />
          <span>{aluno.email}</span>
        </div>

        <div className="lead-info">
          <Phone size={14} />
          <span>{aluno.phone}</span>
        </div>

        {!!aluno.value && (
          <div className="lead-info">
            <AlertCircle size={14} />
            <span>Débito em aberto</span>
          </div>
        )}

        {outrasTags.length > 0 && (
          <div className="lead-tags">
            {outrasTags.slice(0, 2).map((tag, index) => (
              <span key={index} className="lead-tag">
                {tag}
              </span>
            ))}
            {outrasTags.length > 2 && (
              <span className="lead-tag">+{outrasTags.length - 2}</span>
            )}
          </div>
        )}
      </div>

      {!isAdmin && semResponsavel && (
        <button className="lead-assumir-btn" onClick={handleAssumir}>
          <UserPlus size={14} />
          Assumir contato
        </button>
      )}

      <div className="lead-card-footer">
        <div className="lead-meta">
          <span>{formatDate(aluno.createdAt)}</span>
        </div>
        {aluno.interactions.length > 0 && (
          <span className="interaction-count">
            {aluno.interactions.length} interações
          </span>
        )}
      </div>
    </div>
  );
};

export default AlunoCard;
