import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { AlunoStatus, CanalContato } from "../types";
import { TAGS_DISPONIVEIS } from "../utils/tags";
import { ArrowLeft, Save } from "lucide-react";
import "./AlunoForm.css";

const AlunoForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getAluno, addAluno, updateAluno } = useAlunos();
  const { user } = useAuth();
  const { showToast } = useToast();
  const isEditing = !!id;

  const existingAluno = isEditing ? getAluno(id!) : null;

  const [formData, setFormData] = useState({
    name: existingAluno?.name || "",
    email: existingAluno?.email || "",
    phone: existingAluno?.phone || "",
    ra: existingAluno?.ra || "",
    curso: existingAluno?.curso || "",
    turno: existingAluno?.turno || "",
    status: existingAluno?.status || ("pendente" as AlunoStatus),
    source: existingAluno?.source || ("telefone" as CanalContato),
    value: existingAluno?.value?.toString() || "",
    observations: existingAluno?.observations || "",
    tags: existingAluno?.tags || ([] as string[]),
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isEditing && !existingAluno) {
      showToast("Aluno não encontrado!", "error");
      navigate("/alunos");
    }
  }, [isEditing, existingAluno, navigate, showToast]);

  const statuses: { value: AlunoStatus; label: string }[] = [
    { value: "cadastrado", label: "Cadastrado" },
    { value: "pendente", label: "Pendente de Contato" },
    { value: "contatado", label: "Contato Realizado" },
    { value: "aguardando_retorno", label: "Aguardando Retorno" },
    { value: "confirmado", label: "Confirmou Interesse" },
    { value: "documentacao", label: "Documentação/Pagamento" },
    { value: "aguardando_matricula", label: "Aguardando Matrícula" },
    { value: "matricula_confirmada", label: "Matrícula Confirmada" },
    { value: "rematriculado", label: "Rematriculado" },
    { value: "desistente", label: "Desistente" },
  ];

  const sources: { value: CanalContato; label: string }[] = [
    { value: "telefone", label: "Telefone" },
    { value: "whatsapp", label: "WhatsApp" },
    { value: "email", label: "E-mail" },
    { value: "presencial", label: "Presencial" },
    { value: "ava", label: "AVA / Portal do Aluno" },
    { value: "indicacao", label: "Indicação" },
    { value: "outro", label: "Outro" },
  ];

  const turnos = ["Matutino", "Vespertino", "Noturno", "EAD"];

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const toggleTag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter((t) => t !== tag)
        : [...prev.tags, tag],
    }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Nome é obrigatório";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email é obrigatório";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Email inválido";
    }

    if (!formData.phone.trim()) {
      newErrors.phone = "Telefone é obrigatório";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate() || !user) return;

    setIsSubmitting(true);

    try {
      const alunoData = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        ra: formData.ra.trim() || undefined,
        curso: formData.curso.trim() || undefined,
        turno: formData.turno.trim() || undefined,
        status: formData.status,
        source: formData.source,
        value: formData.value ? parseFloat(formData.value) : undefined,
        observations: formData.observations.trim() || undefined,
        tags: formData.tags,
      };

      if (isEditing) {
        await updateAluno(id!, alunoData);
        showToast("Aluno atualizado com sucesso!", "success");
        navigate(`/alunos/${id}`);
      } else {
        await addAluno({
          ...alunoData,
          statusAtualizadoEm: new Date(),
          createdBy: user.id,
        });
        showToast("Aluno criado com sucesso!", "success");
        navigate("/alunos");
      }
    } catch (error) {
      console.error("Erro ao salvar aluno:", error);
      showToast("Erro ao salvar aluno. Tente novamente.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="lead-form-page">
      <div className="lead-form-header">
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
          <span>Voltar</span>
        </button>
        <h1>{isEditing ? "Editar Aluno" : "Novo Aluno"}</h1>
      </div>

      <div className="lead-form-container">
        <form onSubmit={handleSubmit} className="lead-form">
          {/* Informações Básicas */}
          <div className="form-section">
            <h2>Informações Básicas</h2>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="name">
                  Nome <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className={errors.name ? "error" : ""}
                  placeholder="Nome completo do aluno"
                />
                {errors.name && (
                  <span className="error-message">{errors.name}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="email">
                  Email <span className="required">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={errors.email ? "error" : ""}
                  placeholder="email@exemplo.com"
                />
                {errors.email && (
                  <span className="error-message">{errors.email}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="phone">
                  Telefone <span className="required">*</span>
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className={errors.phone ? "error" : ""}
                  placeholder="(00) 00000-0000"
                />
                {errors.phone && (
                  <span className="error-message">{errors.phone}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="ra">RA / Matrícula</label>
                <input
                  type="text"
                  id="ra"
                  name="ra"
                  value={formData.ra}
                  onChange={handleChange}
                  placeholder="Número de matrícula"
                />
              </div>

              <div className="form-group">
                <label htmlFor="curso">Curso</label>
                <input
                  type="text"
                  id="curso"
                  name="curso"
                  value={formData.curso}
                  onChange={handleChange}
                  placeholder="Nome do curso"
                />
              </div>

              <div className="form-group">
                <label htmlFor="turno">Turno</label>
                <select
                  id="turno"
                  name="turno"
                  value={formData.turno}
                  onChange={handleChange}
                >
                  <option value="">Selecione</option>
                  {turnos.map((turno) => (
                    <option key={turno} value={turno}>
                      {turno}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Status e Canal */}
          <div className="form-section">
            <h2>Classificação</h2>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="status">Status</label>
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                >
                  {statuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="source">Canal de Contato</label>
                <select
                  id="source"
                  name="source"
                  value={formData.source}
                  onChange={handleChange}
                >
                  {sources.map((source) => (
                    <option key={source.value} value={source.value}>
                      {source.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="value">Débito/Valor Pendente (R$)</label>
                <input
                  type="number"
                  id="value"
                  name="value"
                  value={formData.value}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>
          </div>

          {/* Observações e Tags */}
          <div className="form-section">
            <h2>Informações Adicionais</h2>
            <div className="form-group">
              <label>Tags</label>
              <div className="tags-picker">
                {TAGS_DISPONIVEIS.map((tag) => {
                  const selected = formData.tags.includes(tag);
                  return (
                    <button
                      type="button"
                      key={tag}
                      className={`tag-chip${selected ? " tag-chip-selected" : ""}`}
                      onClick={() => toggleTag(tag)}
                      aria-pressed={selected}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
              <small>Clique para adicionar ou remover uma etiqueta</small>
            </div>

            <div className="form-group">
              <label htmlFor="observations">Observações</label>
              <textarea
                id="observations"
                name="observations"
                value={formData.observations}
                onChange={handleChange}
                placeholder="Informações adicionais sobre o aluno..."
                rows={4}
              />
            </div>
          </div>

          {/* Botões */}
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate(-1)}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              <Save size={18} />
              <span>
                {isSubmitting
                  ? "Salvando..."
                  : isEditing
                  ? "Salvar Alterações"
                  : "Criar Aluno"}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AlunoForm;