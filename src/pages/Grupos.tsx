import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAlunos } from "../hooks/useAlunos";
import { calcularGrupos, Grupo } from "../services/gruposService";
import { getStatusColor, getStatusLabel } from "../utils/formatters";
import { TAGS_DISPONIVEIS } from "../utils/tags";
import { AlunoStatus, Area } from "../types";
import { AREA_CONFIG, AREAS_ORDENADAS } from "../config/areas";
import { Layers, ChevronDown, ChevronRight, Users, X } from "lucide-react";
import "./Grupos.css";

const Grupos: React.FC = () => {
  const { alunos } = useAlunos();
  const navigate = useNavigate();

  const [busca, setBusca] = useState("");
  const [funilFiltro, setFunilFiltro] = useState<Area | "todos">("todos");
  const [statusFiltro, setStatusFiltro] = useState<AlunoStatus | "todos">("todos");
  const [tagFiltro, setTagFiltro] = useState<string | "todas">("todas");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [outrosExpandido, setOutrosExpandido] = useState(false);

  // Filtro por funil aplicado ANTES de calcular os grupos — cada funil tem
  // seu próprio conjunto de status (ver config/areas.ts), então filtrar
  // aqui também restringe corretamente as opções de status logo abaixo.
  const alunosDoFunil = useMemo(
    () => (funilFiltro === "todos" ? alunos : alunos.filter((a) => a.area === funilFiltro)),
    [alunos, funilFiltro]
  );

  // Recalcula sempre que a lista de alunos do contexto muda (grupos "ao vivo").
  const { grupos, outros, totalOutros } = useMemo(() => calcularGrupos(alunosDoFunil), [alunosDoFunil]);

  const statusPresentes = useMemo(() => {
    const set = new Set<AlunoStatus>();
    [...grupos, ...outros].forEach((g) => set.add(g.status));
    return Array.from(set).sort((a, b) => getStatusLabel(a).localeCompare(getStatusLabel(b), "pt-BR"));
  }, [grupos, outros]);

  const passaNoFiltro = (g: Grupo) => {
    if (statusFiltro !== "todos" && g.status !== statusFiltro) return false;
    if (tagFiltro !== "todas" && !g.tags.includes(tagFiltro)) return false;
    if (busca.trim()) {
      const alvo = `${getStatusLabel(g.status)} ${g.tags.join(" ")}`.toLowerCase();
      if (!alvo.includes(busca.trim().toLowerCase())) return false;
    }
    return true;
  };

  const gruposFiltrados = grupos.filter(passaNoFiltro);
  const filtroAtivo =
    busca.trim() !== "" || funilFiltro !== "todos" || statusFiltro !== "todos" || tagFiltro !== "todas";

  const limparFiltros = () => {
    setBusca("");
    setFunilFiltro("todos");
    setStatusFiltro("todos");
    setTagFiltro("todas");
  };

  const toggleExpandido = (chave: string) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  };

  return (
    <div className="grupos-page">
      {/* Cabeçalho */}
      <div className="grupos-header">
        <div className="grupos-header-title">
          <Layers size={22} />
          <h1>Grupos</h1>
        </div>
        <p className="grupos-subtitle">
          Segmentação automática por combinação de status + etiquetas, dentro
          de um funil por vez. Cada combinação que aparece entre os alunos
          vira um grupo. Desistentes ficam de fora.
        </p>
      </div>

      {/* Filtros */}
      <div className="grupos-filtros">
        <input
          type="text"
          className="grupos-busca"
          placeholder="Buscar por status ou etiqueta..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />

        <select
          className="grupos-select"
          value={funilFiltro}
          onChange={(e) => {
            setFunilFiltro(e.target.value as Area | "todos");
            // Cada funil tem seu próprio conjunto de status — troca de
            // funil sem resetar o status poderia deixar um filtro que não
            // existe mais selecionado (e a lista vazia sem explicação).
            setStatusFiltro("todos");
          }}
        >
          <option value="todos">Todos os funis</option>
          {AREAS_ORDENADAS.map((area) => (
            <option key={area} value={area}>
              {AREA_CONFIG[area].label}
            </option>
          ))}
        </select>

        <select
          className="grupos-select"
          value={statusFiltro}
          onChange={(e) => setStatusFiltro(e.target.value as AlunoStatus | "todos")}
        >
          <option value="todos">Todos os status</option>
          {statusPresentes.map((s) => (
            <option key={s} value={s}>
              {getStatusLabel(s)}
            </option>
          ))}
        </select>

        <select
          className="grupos-select"
          value={tagFiltro}
          onChange={(e) => setTagFiltro(e.target.value)}
        >
          <option value="todas">Todas as etiquetas</option>
          {TAGS_DISPONIVEIS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {filtroAtivo && (
          <button className="grupos-limpar" onClick={limparFiltros}>
            <X size={14} /> Limpar
          </button>
        )}
      </div>

      {/* Lista de grupos */}
      {gruposFiltrados.length === 0 && !(outros.length > 0 && !filtroAtivo) ? (
        <div className="grupos-vazio">
          <Users size={48} />
          <p>Nenhum grupo encontrado com esse filtro.</p>
        </div>
      ) : (
        <div className="grupos-lista">
          {gruposFiltrados.map((g) => {
            const aberto = expandidos.has(g.chave);
            const cor = getStatusColor(g.status);
            return (
              <div key={g.chave} className={`grupo-card ${aberto ? "aberto" : ""}`}>
                <button
                  className="grupo-card-header"
                  style={{ borderLeftColor: cor }}
                  onClick={() => toggleExpandido(g.chave)}
                >
                  {aberto ? <ChevronDown size={18} /> : <ChevronRight size={18} />}

                  <span className="grupo-status-badge" style={{ background: cor }}>
                    {getStatusLabel(g.status)}
                  </span>

                  <div className="grupo-tags">
                    {g.tags.length === 0 ? (
                      <span className="grupo-tag grupo-tag-vazia">sem tags</span>
                    ) : (
                      g.tags.map((t) => (
                        <span key={t} className="grupo-tag">
                          {t}
                        </span>
                      ))
                    )}
                  </div>

                  <span className="grupo-contador">{g.total}</span>
                </button>

                {aberto && (
                  <div className="grupo-card-body">
                    {g.alunos.map((aluno) => (
                      <div
                        key={aluno.id}
                        className="grupo-aluno-linha"
                        onClick={() => navigate(`/alunos/${aluno.id}`)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && navigate(`/alunos/${aluno.id}`)}
                      >
                        <span className="grupo-aluno-nome">{aluno.name}</span>
                        <span className="grupo-aluno-detalhe">
                          {[aluno.curso, aluno.ra ? `RA ${aluno.ra}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Bucket "Outros" — grupos pequenos (menos de 3 alunos) agrupados */}
          {outros.length > 0 && !filtroAtivo && (
            <div className={`grupo-card grupo-outros ${outrosExpandido ? "aberto" : ""}`}>
              <button
                className="grupo-card-header"
                onClick={() => setOutrosExpandido((prev) => !prev)}
              >
                {outrosExpandido ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                <span className="grupo-status-badge grupo-status-outros">Outros</span>
                <span className="grupos-outros-legenda">
                  {outros.length} combinações com poucos alunos
                </span>
                <span className="grupo-contador">{totalOutros}</span>
              </button>

              {outrosExpandido && (
                <div className="grupo-card-body">
                  {outros.map((g) => (
                    <div key={g.chave} className="grupo-outros-subgrupo">
                      <div className="grupo-outros-subgrupo-titulo">
                        <span
                          className="grupo-status-badge grupo-status-badge-mini"
                          style={{ background: getStatusColor(g.status) }}
                        >
                          {getStatusLabel(g.status)}
                        </span>
                        {g.tags.map((t) => (
                          <span key={t} className="grupo-tag">
                            {t}
                          </span>
                        ))}
                      </div>
                      {g.alunos.map((aluno) => (
                        <div
                          key={aluno.id}
                          className="grupo-aluno-linha"
                          onClick={() => navigate(`/alunos/${aluno.id}`)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === "Enter" && navigate(`/alunos/${aluno.id}`)}
                        >
                          <span className="grupo-aluno-nome">{aluno.name}</span>
                          <span className="grupo-aluno-detalhe">
                            {[aluno.curso, aluno.ra ? `RA ${aluno.ra}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Grupos;