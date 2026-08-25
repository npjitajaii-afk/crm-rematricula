import React, { useEffect, useState } from "react";
import { Link2, X } from "lucide-react";
import { Aluno, Area, AlunoStatus, CanalContato } from "../types";
import { useAlunos } from "../hooks/useAlunos";
import { useToast } from "../hooks/useToast";
import { AREA_CONFIG, AREAS_ORDENADAS } from "../config/areas";
import { TAGS_SELECIONAVEIS_POR_AREA } from "../utils/tags";
import "./DelegarContatoModal.css";
import "../pages/AlunoForm.css";
import "./NovaMatriculaModal.css";

interface NovaMatriculaModalProps {
  /** Aluno de origem — nome/e-mail/telefone são copiados dele. */
  aluno: Aluno;
  onClose: () => void;
  /** Chamado com o id da matrícula recém-criada, pra quem chamou poder
   * abrir o card dela em seguida, se quiser. */
  onCriada?: (novoId: string) => void;
}

const TURNOS = ["Matutino", "Vespertino", "Noturno", "EAD"];

const SOURCES: { value: CanalContato; label: string }[] = [
  { value: "telefone", label: "Telefone" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "presencial", label: "Presencial" },
  { value: "ava", label: "AVA / Portal do Aluno" },
  { value: "indicacao", label: "Indicação" },
  { value: "outro", label: "Outro" },
];

// Modal chamado a partir do "+" no card / modal expandido de um aluno que
// tem duas matrículas no mesmo edital (dois cursos, dois RAs). Cria um
// segundo registro com nome/e-mail/telefone copiados, ligado ao primeiro
// via matriculaVinculadaId — ver README/017_matricula_vinculada.sql. Os
// dois continuam sendo cards independentes: status e etiquetas de cada um
// se gerenciam separadamente dali pra frente.
const NovaMatriculaModal: React.FC<NovaMatriculaModalProps> = ({
  aluno,
  onClose,
  onCriada,
}) => {
  const { criarMatriculaVinculada } = useAlunos();
  const { showToast } = useToast();

  const [area, setArea] = useState<Area>(aluno.area);
  const [ra, setRa] = useState("");
  const [curso, setCurso] = useState("");
  const [turno, setTurno] = useState("");
  const [status, setStatus] = useState<AlunoStatus>(AREA_CONFIG[aluno.area].statusInicial);
  const [source, setSource] = useState<CanalContato>("telefone");
  const [tags, setTags] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !salvando) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, salvando]);

  const areaConfig = AREA_CONFIG[area];
  const statusOptions = areaConfig.statuses.map((s) => ({
    value: s,
    label: areaConfig.getLabel(s),
  }));
  const tagsSelecionaveis =
    area === "rematricula" || area === "engajamento"
      ? TAGS_SELECIONAVEIS_POR_AREA[area]
      : [];

  const handleAreaChange = (novaArea: Area) => {
    setArea(novaArea);
    setStatus(AREA_CONFIG[novaArea].statusInicial);
    setTags([]);
  };

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const salvar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ra.trim()) {
      setErro("Informe o RA da nova matrícula.");
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      await criarMatriculaVinculada(aluno.id, {
        ra: ra.trim(),
        curso: curso.trim() || undefined,
        turno: turno || undefined,
        area,
        status,
        source,
        tags,
      });
      showToast("Nova matrícula vinculada criada com sucesso.", "success");
      onCriada?.(aluno.id);
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao criar matrícula vinculada.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget && !salvando) onClose();
      }}
    >
      <form
        className="delegar-contato-modal nova-matricula-modal"
        onSubmit={salvar}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nova-matricula-titulo"
      >
        <div className="delegar-contato-header">
          <h2 id="nova-matricula-titulo">
            <Link2 size={19} /> Nova matrícula vinculada
          </h2>
          <button type="button" onClick={onClose} aria-label="Fechar" disabled={salvando}>
            <X size={18} />
          </button>
        </div>
        <p>
          Cria um segundo card pra <strong>{aluno.name}</strong>, mesma pessoa em outro curso —
          nome, e-mail e telefone são copiados automaticamente. Os dois cards ficam vinculados
          (acesso rápido de um pro outro), mas com status e etiquetas próprios.
        </p>

        {erro && <div className="nova-matricula-erro">{erro}</div>}

        <label>
          RA da nova matrícula
          <input
            type="text"
            value={ra}
            onChange={(e) => setRa(e.target.value)}
            placeholder="Ex: 2026123456"
            required
          />
        </label>

        <div className="nova-matricula-linha">
          <label>
            Curso
            <input type="text" value={curso} onChange={(e) => setCurso(e.target.value)} />
          </label>
          <label>
            Turno
            <select value={turno} onChange={(e) => setTurno(e.target.value)}>
              <option value="">—</option>
              {TURNOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="nova-matricula-linha">
          <label>
            Funil
            <select value={area} onChange={(e) => handleAreaChange(e.target.value as Area)}>
              {AREAS_ORDENADAS.map((a) => (
                <option key={a} value={a}>
                  {AREA_CONFIG[a].label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status inicial
            <select value={status} onChange={(e) => setStatus(e.target.value as AlunoStatus)}>
              {statusOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Canal de Contato
          <select value={source} onChange={(e) => setSource(e.target.value as CanalContato)}>
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        {tagsSelecionaveis.length > 0 && (
          <div className="nova-matricula-tags">
            <span className="nova-matricula-tags-label">Etiquetas</span>
            <div className="tags-picker">
              {tagsSelecionaveis.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  className={`tag-chip${tags.includes(tag) ? " tag-chip-selected" : ""}`}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="delegar-contato-acoes">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={salvando}>
            {salvando ? "Criando..." : "Criar matrícula vinculada"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default NovaMatriculaModal;
