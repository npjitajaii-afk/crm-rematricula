import React, { useState, useEffect, useMemo, useCallback, ReactNode, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Aluno, AlunoFilters, Interacao, PipelineStatusResumo, Area, AlunoStatus, CanalContato, Polo } from "../types";
import {
  getAlunos,
  getAlunoById,
  createAluno,
  createAlunosBulk,
  updateAluno as updateAlunoService,
  deleteAluno as deleteAlunoService,
  deleteAlunosBulk as deleteAlunosBulkService,
  assumirAluno as assumirAlunoService,
  delegarAluno as delegarAlunoService,
  criarMatriculaVinculada as criarMatriculaVinculadaService,
  desvincularMatricula as desvincularMatriculaService,
  getPipelineResumo,
  getColaboradores as getColaboradoresService,
  addInteraction as addInteractionService,
} from "../services/alunosService";
import { getPolos as getPolosService } from "../services/polosService";
import { useAuth } from "../hooks/useAuth";
import { AlunosContext } from "./alunos-context";
import {
  normalizeRow,
  normalizeHeader,
  pickFields,
  findHeaderRowIndex,
  FieldSpec,
} from "../utils/planilhaImport";
import { getStatusLabel } from "../utils/formatters";

/** Observações podem ser JSON de anotações ou texto legado. */
function flattenObservacoes(raw: string | undefined): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((a: { texto?: string; autorNome?: string }) =>
          a.texto
            ? `${a.autorNome ? a.autorNome + ": " : ""}${a.texto}`
            : ""
        )
        .filter(Boolean)
        .join(" | ");
    }
  } catch {
    /* texto simples */
  }
  return raw;
}

interface AlunosProviderProps {
  children: ReactNode;
}

export const AlunosProvider: React.FC<AlunosProviderProps> = ({
  children,
}) => {
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [isLoadingAlunos, setIsLoadingAlunos] = useState(true);
  const [filters, setFilters] = useState<AlunoFilters>({});
  const [statusResumo, setStatusResumo] = useState<PipelineStatusResumo[]>([]);
  const [colaboradores, setColaboradores] = useState<
    { id: string; name: string; email: string; poloId?: string; poloNome?: string }[]
  >([]);
  const [polos, setPolos] = useState<Polo[]>([]);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isSupervisor = user?.role === "supervisor";
  /** Admin ou supervisor — gestão do polo inteiro (delegar, excluir, ver equipe). */
  const canGerenciarPolo = isAdmin || isSupervisor;

  // Áreas já carregadas com sucesso (lazy load por funil).
  const areasCarregadasRef = useRef<Set<string>>(new Set());
  // Evita duas requests paralelas da mesma área (login + troca de rota).
  const areasEmCarregamentoRef = useRef<Map<string, Promise<void>>>(new Map());
  const location = useLocation();

  // Detecta a área do funil pela URL. Usado no login e na navegação.
  const detectarAreaAtivaPelaRota = (pathname: string): Aluno["area"] | undefined => {
    if (pathname.startsWith("/retencao")) return "retencao";
    if (pathname.startsWith("/engajamento")) return "engajamento";
    if (
      pathname.startsWith("/alunos") ||
      pathname.startsWith("/meus-contatos") ||
      pathname.startsWith("/risco-evasao") ||
      pathname.startsWith("/rematricula")
    ) {
      return "rematricula";
    }
    return undefined; // dashboard, métricas, etc. — sem área prioritária
  };

  /**
   * Junta alunos de UMA área no estado sem apagar as outras.
   * Antes o onPage fazia setAlunos(parcial) e zerava o outro funil
   * quando as duas áreas carregavam em paralelo (sintoma: um funil
   * cheio e o outro vazio até dar F5).
   */
  const mergeAlunosDaArea = useCallback(
    (area: Aluno["area"], daArea: Aluno[]) => {
      setAlunos((prev) => {
        const outros = prev.filter((a) => a.area !== area);
        // Evita duplicar ids caso a mesma área seja mergeada de novo.
        const idsOutros = new Set(outros.map((a) => a.id));
        const limpos = daArea.filter((a) => !idsOutros.has(a.id));
        return [...outros, ...limpos];
      });
    },
    []
  );

  /**
   * Carrega uma área sob demanda (só se ainda não estiver no cache).
   * Mantém o princípio: não busca tudo no login — só o funil ativo.
   */
  const ensureAreaLoaded = useCallback(
    async (area: Aluno["area"]) => {
      if (!user) return;
      if (areasCarregadasRef.current.has(area)) return;

      // Se já tem request em andamento pra essa área, reutiliza.
      const emAndamento = areasEmCarregamentoRef.current.get(area);
      if (emAndamento) {
        await emAndamento;
        return;
      }

      const promise = (async () => {
        try {
          const { alunos: daArea, error } = await getAlunos({
            areaPrioritaria: area,
            somenteAreaPrioritaria: true,
          });
          if (error) {
            console.error("Erro ao carregar área", area, error);
            // Não marca como carregada — permite retry na próxima navegação.
            return;
          }
          mergeAlunosDaArea(area, daArea);
          areasCarregadasRef.current.add(area);
        } finally {
          areasEmCarregamentoRef.current.delete(area);
        }
      })();

      areasEmCarregamentoRef.current.set(area, promise);
      await promise;
    },
    [user?.id, mergeAlunosDaArea]
  );

  // Login / troca de usuário: carrega meta + área da rota atual (lazy).
  useEffect(() => {
    let cancelado = false;

    const loadAlunos = async () => {
      if (!user) {
        setAlunos([]);
        setStatusResumo([]);
        setColaboradores([]);
        setPolos([]);
        areasCarregadasRef.current = new Set();
        areasEmCarregamentoRef.current = new Map();
        setIsLoadingAlunos(false);
        return;
      }

      setIsLoadingAlunos(true);
      // Novo login: zera cache de áreas pra não misturar dados de sessão anterior.
      areasCarregadasRef.current = new Set();
      areasEmCarregamentoRef.current = new Map();
      setAlunos([]);

      let primeiroLoteChegou = false;
      const areaAtiva = detectarAreaAtivaPelaRota(window.location.pathname);
      const areaInicial: Aluno["area"] = areaAtiva ?? "rematricula";

      try {
        // Meta em paralelo (não bloqueia a lista).
        const metaPromise = Promise.all([
          getPipelineResumo(),
          getColaboradoresService(),
          getPolosService(),
        ]).then(([pipelineRes, colabRes, polosRes]) => {
          if (cancelado) return;
          if (pipelineRes.error) {
            console.error("Erro ao carregar resumo do pipeline:", pipelineRes.error);
          } else {
            setStatusResumo(pipelineRes.resumo);
          }
          if (colabRes.error) {
            console.error("Erro ao carregar colaboradores:", colabRes.error);
          } else {
            setColaboradores(colabRes.colaboradores);
          }
          if (polosRes.error) {
            console.error("Erro ao carregar polos:", polosRes.error);
          } else {
            setPolos(polosRes.polos);
          }
        });

        // Só a área da rota no login — outras sob demanda via ensureAreaLoaded.
        // onPage faz MERGE por área (não substitui a lista inteira).
        const carregarAreaInicial = async () => {
          const { error } = await getAlunos({
            areaPrioritaria: areaInicial,
            somenteAreaPrioritaria: true,
            onPage: (parcial) => {
              if (cancelado) return;
              mergeAlunosDaArea(areaInicial, parcial);
              if (!primeiroLoteChegou) {
                primeiroLoteChegou = true;
                setIsLoadingAlunos(false);
              }
            },
          });
          return error;
        };

        // Marca em andamento pra o effect de rota não disparar request duplicada.
        const promiseInicial = carregarAreaInicial();
        areasEmCarregamentoRef.current.set(
          areaInicial,
          promiseInicial.then(() => undefined)
        );

        const error = await promiseInicial;
        areasEmCarregamentoRef.current.delete(areaInicial);

        if (error) {
          console.error("Erro ao carregar alunos:", error);
        } else if (!cancelado) {
          areasCarregadasRef.current.add(areaInicial);
        }

        await metaPromise;

        // Retry se JWT/RLS ainda não estavam prontos no 1º request (lista vazia).
        if (!cancelado && !primeiroLoteChegou) {
          const { error: err2 } = await getAlunos({
            areaPrioritaria: areaInicial,
            somenteAreaPrioritaria: true,
            onPage: (parcial) => {
              if (cancelado) return;
              mergeAlunosDaArea(areaInicial, parcial);
              if (!primeiroLoteChegou) {
                primeiroLoteChegou = true;
                setIsLoadingAlunos(false);
              }
            },
          });
          if (err2) console.error("Erro no retry de alunos:", err2);
          else if (!cancelado) areasCarregadasRef.current.add(areaInicial);
        }
      } finally {
        if (!cancelado) setIsLoadingAlunos(false);
      }
    };

    loadAlunos();

    return () => {
      cancelado = true;
    };
  }, [user?.id, isAdmin, mergeAlunosDaArea]);

  // Navegação entre funis: carrega a área se ainda não estiver no cache.
  useEffect(() => {
    if (!user) {
      areasCarregadasRef.current = new Set();
      areasEmCarregamentoRef.current = new Map();
      return;
    }
    const area = detectarAreaAtivaPelaRota(location.pathname);
    if (area) void ensureAreaLoaded(area);
  }, [user?.id, location.pathname, ensureAreaLoaded]);

  const addAluno = useCallback(
    async (
      newAluno:
        | Omit<Aluno, "id" | "createdAt" | "updatedAt" | "interactions">
        | Omit<
            Aluno,
            "id" | "createdAt" | "updatedAt" | "interactions" | "createdBy"
          >
    ) => {
      if (!user) return;

      const alunoData = {
        ...newAluno,
        createdBy:
          "createdBy" in newAluno && newAluno.createdBy
            ? newAluno.createdBy
            : user.id,
        // Admin também é isolado por polo agora (migration 020) — o INSERT
        // só passa se polo_id bater com o polo de quem está logado, então
        // um poloId explícito diferente do próprio (ex: picker de polo no
        // AlunoForm pra admin) seria rejeitado pela RLS. Por isso ignoramos
        // qualquer poloId vindo de fora e sempre usamos o do usuário logado.
        poloId: user.poloId,
      };

      const { aluno, error } = await createAluno(alunoData);

      if (error) {
        console.error("Erro ao criar aluno:", error);
        throw new Error(error);
      }

      if (aluno) {
        setAlunos((prev) => [aluno, ...prev]);
      }
    },
    [user, isAdmin]
  );

  const updateAluno = useCallback(
    async (id: string, updatedData: Partial<Aluno>) => {
      // Otimista: move o card na hora (drag-and-drop e edições pontuais).
      // Se o servidor falhar, revertemos pro estado anterior.
      let snapshot: Aluno | undefined;
      setAlunos((prev) =>
        prev.map((a) => {
          if (a.id !== id) return a;
          snapshot = a;
          return {
            ...a,
            ...updatedData,
            // statusAtualizadoEm acompanha mudança de status no UI
            ...(updatedData.status
              ? { statusAtualizadoEm: new Date() }
              : {}),
          };
        })
      );

      const { aluno, error } = await updateAlunoService(id, updatedData);

      if (error) {
        console.error("Erro ao atualizar aluno:", error);
        if (snapshot) {
          setAlunos((prev) => prev.map((a) => (a.id === id ? snapshot! : a)));
        }
        throw new Error(error);
      }

      if (aluno) {
        setAlunos((prev) => prev.map((a) => (a.id === id ? aluno : a)));
      }
    },
    []
  );

  const deleteAluno = useCallback(async (id: string) => {
    const { error } = await deleteAlunoService(id);

    if (error) {
      console.error("Erro ao deletar aluno:", error);
      throw new Error(error);
    }

    setAlunos((prev) => prev.filter((aluno) => aluno.id !== id));
  }, []);

  const deleteAlunosBulk = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return 0;

    const { error, deletedCount } = await deleteAlunosBulkService(ids);

    if (error) {
      console.error("Erro ao deletar alunos em massa:", error);
      throw new Error(error);
    }

    setAlunos((prev) => prev.filter((aluno) => !ids.includes(aluno.id)));
    return deletedCount;
  }, []);

  const assumirAluno = useCallback(
    async (id: string) => {
      if (!user) throw new Error("Usuário não autenticado");

      const { aluno, error } = await assumirAlunoService(id, user.id);

      if (error) {
        console.error("Erro ao assumir aluno:", error);
        throw new Error(error);
      }

      if (aluno) {
        setAlunos((prev) => prev.map((a) => (a.id === id ? aluno : a)));
      }
    },
    [user]
  );

  const delegarAluno = useCallback(
    async (id: string, colaboradorId: string) => {
      const { aluno, error } = await delegarAlunoService(id, colaboradorId);

      if (error) {
        console.error("Erro ao delegar aluno:", error);
        throw new Error(error);
      }

      if (aluno) {
        setAlunos((prev) => prev.map((a) => (a.id === id ? aluno : a)));
      }
    },
    []
  );

  const criarMatriculaVinculada = useCallback(
    async (
      origemId: string,
      dados: {
        ra?: string;
        curso?: string;
        turno?: string;
        area: Area;
        status: AlunoStatus;
        source: CanalContato;
        observations?: string;
        tags?: string[];
      }
    ) => {
      if (!user) throw new Error("Usuário não autenticado");

      const { aluno, error } = await criarMatriculaVinculadaService(origemId, {
        ...dados,
        createdBy: user.id,
      });

      if (error) {
        console.error("Erro ao criar matrícula vinculada:", error);
        throw new Error(error);
      }

      if (aluno) {
        // A nova matrícula entra na lista, e a de origem precisa refletir
        // localmente o vínculo recém-criado (o trigger do banco já
        // espelhou isso do lado dele, mas o estado local do React não
        // sabe disso sozinho).
        setAlunos((prev) => [
          aluno,
          ...prev.map((a) =>
            a.id === origemId ? { ...a, matriculaVinculadaId: aluno.id } : a
          ),
        ]);
      }
    },
    [user]
  );

  const desvincularMatricula = useCallback(async (alunoId: string) => {
    const alunoAtual = alunos.find((a) => a.id === alunoId);
    const parceiroId = alunoAtual?.matriculaVinculadaId;

    const { error } = await desvincularMatriculaService(alunoId);
    if (error) {
      console.error("Erro ao desvincular matrícula:", error);
      throw new Error(error);
    }

    setAlunos((prev) =>
      prev.map((a) =>
        a.id === alunoId || (parceiroId && a.id === parceiroId)
          ? { ...a, matriculaVinculadaId: undefined }
          : a
      )
    );
  }, [alunos]);

  // Otimização 5.3: em vez de recarregar TODOS os alunos após adicionar
  // uma interação, buscamos apenas o aluno afetado e atualizamos ele
  // localmente na lista.
  const addInteraction = useCallback(
    async (
      alunoId: string,
      interaction: Omit<Interacao, "id" | "alunoId">
    ) => {
      if (!user) return;

      const { error } = await addInteractionService(
        alunoId,
        user.id,
        interaction.type,
        interaction.description
      );

      if (error) {
        console.error("Erro ao adicionar interação:", error);
        throw new Error(error);
      }

      const { aluno: updatedAluno } = await getAlunoById(alunoId);
      if (updatedAluno) {
        setAlunos((prev) =>
          prev.map((a) => (a.id === alunoId ? updatedAluno : a))
        );
      }
    },
    [user]
  );

  const getAluno = useCallback(
    (id: string): Aluno | undefined => {
      return alunos.find((aluno) => aluno.id === id);
    },
    [alunos]
  );

  // Otimização 5.2: useMemo evita recalcular o filtro em todo re-render,
  // só refaz o filtro quando `alunos` ou `filters` realmente mudam.
  const filteredAlunos = useMemo(() => {
    return alunos.filter((aluno) => {
      if (filters.area && aluno.area !== filters.area) return false;

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          aluno.name.toLowerCase().includes(searchLower) ||
          aluno.email.toLowerCase().includes(searchLower) ||
          aluno.curso?.toLowerCase().includes(searchLower) ||
          aluno.ra?.toLowerCase().includes(searchLower) ||
          aluno.phone.includes(filters.search);

        if (!matchesSearch) return false;
      }

      if (filters.status && filters.status.length > 0) {
        if (!filters.status.includes(aluno.status)) return false;
      }

      if (filters.source && filters.source.length > 0) {
        if (!filters.source.includes(aluno.source)) return false;
      }

      if (filters.dateFrom) {
        if (new Date(aluno.createdAt) < new Date(filters.dateFrom)) return false;
      }

      if (filters.dateTo) {
        const dateTo = new Date(filters.dateTo);
        dateTo.setHours(23, 59, 59, 999);
        if (new Date(aluno.createdAt) > dateTo) return false;
      }

      if (filters.assignedTo) {
        // "__sem__" = contatos sem responsável atribuído
        if (filters.assignedTo === "__sem__") {
          if (aluno.assignedTo) return false;
        } else if (aluno.assignedTo !== filters.assignedTo) {
          return false;
        }
      }

      if (filters.poloId) {
        if (aluno.poloId !== filters.poloId) return false;
      }

      return true;
    });
  }, [alunos, filters]);

  /**
   * Specs de casamento de coluna pra planilha de Rematrícula. A ordem
   * importa: campos mais "específicos" (RA, curso, turno, status do
   * aluno) vêm antes de "nome" pra garantir que colunas como
   * "NOME_CURSO" sejam capturadas pelo campo certo antes de qualquer
   * tentativa aproximada de achar o nome do aluno. Ver
   * src/utils/planilhaImport.ts para o algoritmo de casamento.
   */
  const REMATRICULA_FIELD_SPECS: FieldSpec[] = [
    {
      field: "email",
      aliases: ["EMAIL", "E_MAIL", "EMAIL_ALUNO", "ENDERECO_DE_EMAIL"],
      keywords: ["EMAIL"],
    },
    {
      field: "telefone",
      aliases: [
        "FONE", "TELEFONE", "PHONE", "CELULAR", "WHATSAPP", "WHATS",
        "TELEFONE_CELULAR", "TELEFONE_CONTATO", "NUMERO", "CONTATO_TELEFONE",
      ],
      keywords: ["FONE", "TELEFONE", "CELULAR", "WHATSAPP", "WHATS"],
    },
    {
      field: "codigoAluno",
      aliases: [
        // Planilhas Uniasselvi / similares usam CD_ALUNO (não CODIGO_ALUNO)
        "CD_ALUNO", "CDALUNO", "CODIGO_ALUNO", "COD_ALUNO", "CODIGOALUNO",
        "RA", "MATRICULA", "NUMERO_MATRICULA", "N_MATRICULA", "NR_MATRICULA",
        "REGISTRO_ACADEMICO", "CODIGO_MATRICULA", "ID_ALUNO", "NUM_ALUNO",
        "NR_ALUNO", "MATRICULA_ALUNO",
      ],
      keywords: ["MATRICULA", "REGISTRO", "CD_ALUNO", "CODIGO_ALUNO"],
      exclude: ["DATA", "STATUS", "SITUACAO", "CURSO"],
    },
    {
      field: "curso",
      aliases: [
        "NOME_CURSO", "CURSO", "CURSO_ALUNO", "NOME_DO_CURSO",
        "CD_CURSO", "CODIGO_CURSO", "COD_CURSO",
      ],
      keywords: ["CURSO"],
    },
    {
      field: "turno",
      aliases: ["TURNO"],
      keywords: ["TURNO"],
    },
    {
      field: "tipoAluno",
      aliases: ["TIPO", "TIPO_ALUNO", "TIPO_DE_ALUNO", "PERFIL_ALUNO"],
      keywords: ["TIPO", "PERFIL"],
      exclude: ["ENTRADA", "CONTATO", "CURSO"],
    },
    {
      field: "statusAluno",
      aliases: ["STATUS_ALUNO", "SITUACAO_CADASTRO", "SITUACAO_ALUNO"],
      keywords: ["CADASTRO"],
      exclude: ["RENOVACAO", "MATRICULA", "CURSO"],
    },
    {
      field: "statusRenovacao",
      aliases: ["STATUS", "SITUACAO", "SITUACAO_RENOVACAO", "STATUS_RENOVACAO"],
      keywords: ["STATUS", "SITUACAO"],
    },
    {
      field: "tagsPlanilha",
      aliases: ["TAGS", "ETIQUETAS", "ETIQUETA"],
      keywords: ["TAGS", "ETIQUETA", "ETIQUETAS"],
    },
    {
      field: "observacoesPlanilha",
      aliases: ["OBSERVACOES", "OBSERVATIONS", "OBS", "COMENTARIOS", "ANOTACOES"],
      keywords: ["OBSERVACAO", "OBSERVACOES", "OBS", "COMENTARIO", "ANOTACAO"],
    },
    {
      field: "canal",
      aliases: [
        "CANAL", "CANAL_CONTATO", "ORIGEM", "FONTE", "CANAL_DE_CONTATO",
        "CANAL_DA_MATRICULA",
      ],
      keywords: ["CANAL", "ORIGEM", "FONTE"],
    },
    {
      field: "valor",
      aliases: [
        "VALOR", "VALOR_PENDENTE", "MENSALIDADE", "VALOR_MENSALIDADE",
        "DEBITO", "VALOR_DEBITO",
      ],
      keywords: ["VALOR", "MENSALIDADE", "DEBITO"],
    },
    {
      // Vem por último de propósito: qualquer coluna já reivindicada pelos
      // campos acima (ex: "NOME_CURSO" -> curso) não é candidata aqui, e o
      // exclude cobre os casos que ainda restarem (nome de curso/mãe/pai
      // que por acaso comece com "NOME").
      field: "nome",
      aliases: ["NOME_ALUNO", "NOME", "NAME", "NOME_COMPLETO", "ALUNO"],
      keywords: ["NOME", "ALUNO"],
      exclude: ["CURSO", "MAE", "PAI", "RESPONSAVEL", "POLO", "TURMA", "EMPRESA"],
    },
  ];

  const REMATRICULA_HEADER_KEYWORDS = [
    ["NOME", "ALUNO", "NOME_ALUNO"],
    ["EMAIL", "E_MAIL"],
    ["FONE", "TELEFONE", "CELULAR"],
    ["CURSO"],
    ["RA", "MATRICULA", "CD_ALUNO", "CODIGO_ALUNO"],
  ];

  /**
   * Converte uma linha já normalizada da planilha nos dados de um aluno.
   * Extraído do importAlunos para não recriar a função a cada linha.
   */
  const rowToAlunoData = (
    rawRow: unknown,
    userId: string
  ): Omit<Aluno, "id" | "createdAt" | "updatedAt" | "interactions"> | null => {
    const r = normalizeRow(rawRow as Record<string, unknown>);
    const campos = pickFields(r, REMATRICULA_FIELD_SPECS);

    const nome = campos.nome || "";
    const email = campos.email || "";
    const telefone = campos.telefone || "";

    // Linha vazia ou sem nenhum dado útil: ignora em vez de mandar pro banco.
    if (!nome && !email && !telefone) return null;

    const codigoAluno = campos.codigoAluno || "";
    const curso = campos.curso || "";
    const turno = campos.turno || "";

    // Campos específicos da planilha de rematrícula: viram tags no card
    // (ex: "Veterano", "Cadastrado") e a situação de renovação vira
    // observação, já que não é um dos status do funil interno.
    const tipoAluno = campos.tipoAluno || ""; // Calouro / Veterano / Winback
    const statusAluno = campos.statusAluno || ""; // ex: Cadastrado
    const statusRenovacao = campos.statusRenovacao || ""; // ex: Não Renovado

    const tagsPlanilha = campos.tagsPlanilha || "";
    const tags = [
      tipoAluno,
      statusAluno,
      ...(tagsPlanilha ? tagsPlanilha.split(",").map((t) => t.trim()) : []),
    ].filter(Boolean);

    const observacoesPlanilha = campos.observacoesPlanilha || "";
    const observations = [
      statusRenovacao ? `Situação na importação: ${statusRenovacao}` : "",
      observacoesPlanilha,
    ]
      .filter(Boolean)
      .join(" | ");

    return {
      name: nome,
      email,
      phone: telefone,
      ra: codigoAluno || undefined,
      curso: curso || undefined,
      turno: turno || undefined,
      // Importação é sempre a base histórica de Rematrícula, independente
      // do que a planilha trazer (ex: tag "Calouro") — ver README.md seção 5.
      area: "rematricula",
      status: "pendente" as Aluno["status"],
      statusAtualizadoEm: new Date(),
      source: (campos.canal || "outro") as Aluno["source"],
      value: parseFloat(campos.valor || "0") || undefined,
      observations: observations || undefined,
      // Sem isso, o INSERT cai no polo padrão (Itajaí) via DEFAULT da
      // coluna — não no polo de quem está importando. Todo aluno criado
      // (inclusive por admin) fica no polo de quem o criou.
      poloId: user?.poloId,
      tags,
      createdBy: userId,
    };
  };

  // Otimização 5.1: import dinâmico do xlsx dentro de importAlunos.
  // A lib é carregada só quando o usuário realmente importa um arquivo,
  // reduzindo o bundle inicial em ~1.2 MB.
  const importAlunos = useCallback(async (
    file: File,
    onProgress?: (done: number, total: number) => void
  ): Promise<void> => {
    if (!user) throw new Error("Usuário não autenticado");

    const jsonData: unknown[] = await new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(data, { type: "binary" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];

          // Não dá pra assumir que a linha 1 sempre é o cabeçalho — a
          // planilha pode chegar com título, logo ou linhas em branco
          // antes da tabela. Detecta a linha de cabeçalho de verdade
          // procurando por colunas reconhecíveis (nome, email, etc.).
          const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
            header: 1,
            defval: "",
          });
          const headerRow = findHeaderRowIndex(rawRows, REMATRICULA_HEADER_KEYWORDS, 2);
          resolve(
            XLSX.utils.sheet_to_json(worksheet, { range: headerRow, defval: "" })
          );
        } catch (err) {
          // Antes essa mensagem era sempre genérica, sem dizer o que
          // quebrou de verdade — impossível diagnosticar quando alguém
          // reportava "deu erro". Agora repassa a causa real (formato de
          // arquivo inválido, aba vazia, etc.) junto.
          const motivo = err instanceof Error ? err.message : String(err);
          reject(new Error(`Erro ao processar arquivo: ${motivo}`));
        }
      };

      reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
      reader.readAsBinaryString(file);
    });

    const alunosData = jsonData
      .map((rawRow) => rowToAlunoData(rawRow, user.id))
      .filter(
        (a): a is Omit<Aluno, "id" | "createdAt" | "updatedAt" | "interactions"> =>
          a !== null
      );

    const total = alunosData.length;
    if (total === 0) {
      onProgress?.(0, 0);
      return { imported: 0, duplicados: 0 };
    }

    // Em vez de 1 requisição por aluno (o que trava o navegador com
    // centenas de conexões simultâneas), agrupamos em lotes: poucas
    // requisições, cada uma já inserindo várias linhas de uma vez.
    // A checagem de duplicados (por RA, ou por nome+telefone) roda dentro
    // de createAlunosBulk sobre o arquivo inteiro de uma vez, pra pegar
    // duplicidade mesmo entre linhas que caem em lotes diferentes.
    const batchSize = 200;
    const { alunos: createdAlunos, errors, duplicados } = await createAlunosBulk(
      alunosData,
      batchSize,
      onProgress
    );

    // Atualiza a lista local imediatamente com o que foi inserido, sem
    // esperar por um novo fetch completo — evita recarregar tudo do zero
    // logo em seguida.
    if (createdAlunos.length > 0) {
      setAlunos((prev) => [...createdAlunos, ...prev]);
    }

    if (errors.length > 0) {
      throw new Error(
        `Alguns lotes falharam ao importar: ${errors.join("; ")}`
      );
    }

    return { imported: createdAlunos.length, duplicados };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const ENGAJAMENTO_FIELD_SPECS: FieldSpec[] = [
    {
      field: "polo",
      aliases: ["POLO", "UNIDADE", "POLO_UNIDADE"],
      keywords: ["POLO", "UNIDADE"],
    },
    {
      field: "email",
      aliases: ["E_MAIL", "EMAIL", "EMAIL_ALUNO"],
      keywords: ["EMAIL"],
    },
    {
      field: "phone",
      aliases: ["CELULAR", "TELEFONE", "FONE", "PHONE", "WHATSAPP", "WHATS"],
      keywords: ["CELULAR", "TELEFONE", "FONE", "WHATSAPP", "WHATS"],
    },
    {
      field: "cpf",
      aliases: ["CPF"],
      keywords: ["CPF"],
    },
    {
      field: "ra",
      aliases: ["CODIGO_INSCRICAO", "RA", "MATRICULA", "NUMERO_MATRICULA"],
      keywords: ["INSCRICAO", "MATRICULA"],
      exclude: ["DATA", "STATUS"],
    },
    {
      field: "curso",
      aliases: ["CURSO", "NOME_CURSO", "CURSO_ALUNO"],
      keywords: ["CURSO"],
    },
    {
      field: "tipoEntrada",
      aliases: ["TIPO_DE_ENTRADA", "TIPO_ENTRADA", "TIPO"],
      keywords: ["ENTRADA", "TIPO"],
      exclude: ["CURSO"],
    },
    {
      field: "canal",
      aliases: ["CANAL_DA_MATRICULA", "CANAL", "CANAL_DE_CONTATO"],
      keywords: ["CANAL"],
    },
    {
      field: "plataforma",
      aliases: ["PLATAFORMA_DETALHE", "PLATAFORMA"],
      keywords: ["PLATAFORMA"],
    },
    {
      field: "dataMatricula",
      aliases: ["DATA_MATRICULA", "DATA_DA_MATRICULA", "DATA"],
      keywords: ["DATA"],
    },
    {
      // Por último: evita roubar colunas de curso/mãe/pai/responsável que
      // por acaso contenham a palavra "NOME".
      field: "name",
      aliases: ["NOME", "NOME_ALUNO", "NAME", "NOME_COMPLETO", "ALUNO"],
      keywords: ["NOME", "ALUNO"],
      exclude: ["CURSO", "MAE", "PAI", "RESPONSAVEL", "POLO", "TURMA", "EMPRESA"],
    },
  ];

  const ENGAJAMENTO_HEADER_KEYWORDS = [
    ["POLO"],
    ["NOME", "ALUNO"],
    ["EMAIL", "E_MAIL"],
    ["CELULAR", "TELEFONE", "FONE"],
  ];

  /** Importa a aba comercial e cria cards apenas para o polo de Itajaí. */
  const importAlunosEngajamento = useCallback(async (
    file: File,
    onProgress?: (done: number, total: number) => void
  ): Promise<{ imported: number; ignored: number }> => {
    if (!user) throw new Error("Usuário não autenticado");

    const jsonData: unknown[] = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(event.target?.result, { type: "binary" });

          // Não trava mais no nome exato "Site + App": aceita variações de
          // espaçamento/acentuação/caixa e, se não achar nenhuma aba com
          // "SITE" e "APP" no nome, cai pra primeira aba que tiver uma
          // coluna "Polo" (a real exigência de dado pra essa importação).
          const normalizeSheetName = (name: string) =>
            name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
          let sheetName = workbook.SheetNames.find((name) => {
            const n = normalizeSheetName(name);
            return n.includes("SITE") && n.includes("APP");
          });

          const findHeaderInSheet = (name: string) => {
            const worksheet = workbook.Sheets[name];
            const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "" });
            const idx = findHeaderRowIndex(rows, [["POLO"]], 1);
            const hasPolo = (rows[idx] || []).some(
              (cell) => normalizeHeader(String(cell ?? "")) === "POLO"
            );
            return hasPolo ? idx : -1;
          };

          if (!sheetName) {
            sheetName = workbook.SheetNames.find((name) => findHeaderInSheet(name) >= 0);
          }
          if (!sheetName) {
            return reject(new Error('Não foi encontrada nenhuma aba com a coluna "Polo" na planilha.'));
          }

          const worksheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "" });
          const headerRow = findHeaderRowIndex(rows, ENGAJAMENTO_HEADER_KEYWORDS, 2);
          resolve(XLSX.utils.sheet_to_json(worksheet, { range: headerRow, defval: "" }));
        } catch (err) {
          // Antes essa mensagem era sempre genérica, sem dizer o que
          // quebrou de verdade — impossível diagnosticar quando alguém
          // reportava "deu erro". Agora repassa a causa real (formato de
          // arquivo inválido, aba vazia, etc.) junto.
          const motivo = err instanceof Error ? err.message : String(err);
          reject(new Error(`Erro ao processar arquivo: ${motivo}`));
        }
      };
      reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
      reader.readAsBinaryString(file);
    });

    const normalizedText = (value: string) => value.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLowerCase();

    let ignored = 0;
    const poloItajai = polos.find((p) =>
      p.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes("itajai")
    );

    const alunosData = jsonData.map((rawRow) => {
      const row = normalizeRow(rawRow as Record<string, unknown>);
      const campos = pickFields(row, ENGAJAMENTO_FIELD_SPECS);

      const polo = campos.polo || "";
      if (!normalizedText(polo).includes("itajai")) { ignored += 1; return null; }
      const name = campos.name || "";
      const email = campos.email || "";
      const phone = campos.phone || "";
      if (!name && !email && !phone) { ignored += 1; return null; }

      const cpf = campos.cpf || "";
      const tipoEntrada = campos.tipoEntrada || "";
      const canal = campos.canal || "";
      const plataforma = campos.plataforma || "";
      const dataMatricula = campos.dataMatricula || "";
      const observacoes = [
        canal && `Canal da matrícula: ${canal}`,
        plataforma && `Plataforma: ${plataforma}`,
        tipoEntrada && `Tipo de entrada: ${tipoEntrada}`,
        dataMatricula && `Data da matrícula: ${dataMatricula}`,
      ].filter(Boolean).join(" | ");

      const aluno: Omit<Aluno, "id" | "createdAt" | "updatedAt" | "interactions"> = {
        name, email, phone,
        ra: campos.ra || undefined,
        curso: campos.curso || undefined,
        area: "engajamento" as const,
        status: "novo_cadastro" as Aluno["status"],
        statusAtualizadoEm: new Date(),
        source: "outro" as Aluno["source"],
        observations: observacoes || undefined,
        tags: [`Polo: ${polo}`, cpf && `CPF: ${cpf}`, tipoEntrada].filter(Boolean),
        createdBy: user.id,
        ...(poloItajai ? { poloId: poloItajai.id } : {}),
      };
      return aluno;
    }).filter((aluno): aluno is Omit<Aluno, "id" | "createdAt" | "updatedAt" | "interactions"> => aluno !== null);

    if (alunosData.length === 0) {
      onProgress?.(0, 0);
      throw new Error("Nenhuma matrícula do polo de Itajaí foi encontrada na planilha.");
    }

    const batchSize = 200;
    const { alunos: createdAlunos, errors, duplicados } = await createAlunosBulk(
      alunosData,
      batchSize,
      onProgress
    );
    if (createdAlunos.length > 0) setAlunos((prev) => [...createdAlunos, ...prev]);
    if (errors.length > 0) throw new Error(`Alguns lotes falharam ao importar: ${errors.join("; ")}`);
    return { imported: createdAlunos.length, ignored, duplicados };
  }, [user, polos]);

  // Otimização 5.1: também usa import dinâmico do xlsx na exportação.
  const exportAlunos = useCallback(
    async (options?: {
      area?: Area;
      fileNamePrefix?: string;
    }): Promise<void> => {
      const lista = options?.area
        ? filteredAlunos.filter((aluno) => aluno.area === options.area)
        : filteredAlunos;

      const dataToExport = lista.map((aluno) => {
        const responsavel = colaboradores.find(
          (c) => c.id === aluno.assignedTo
        );
        return {
          Nome: aluno.name,
          Email: aluno.email,
          Telefone: aluno.phone,
          RA: aluno.ra || "",
          Curso: aluno.curso || "",
          Turno: aluno.turno || "",
          Área: aluno.area,
          Status: getStatusLabel(aluno.status),
          Canal: aluno.source,
          Responsável: responsavel?.name || "",
          Polo: aluno.poloNome || "",
          Tags: (aluno.tags || []).join(", "),
          "Valor Pendente": aluno.value || 0,
          "Data Criação": new Date(aluno.createdAt).toLocaleDateString(
            "pt-BR"
          ),
          "Status desde": new Date(
            aluno.statusAtualizadoEm
          ).toLocaleDateString("pt-BR"),
          Observações: flattenObservacoes(aluno.observations),
        };
      });

      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      const sheetName =
        options?.area === "engajamento"
          ? "Engajamento"
          : options?.area === "retencao"
          ? "Retencao"
          : "Alunos";
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

      const prefix =
        options?.fileNamePrefix ||
        (options?.area ? `alunos-${options.area}` : "alunos-rematricula");
      const fileName = `${prefix}-${
        new Date().toISOString().split("T")[0]
      }.xlsx`;
      XLSX.writeFile(workbook, fileName);
    },
    [filteredAlunos, colaboradores]
  );

  // Otimização (Bloco B): o value do Provider era um objeto literal novo a
  // cada render — como qualquer componente que usa useAlunos() assina o
  // contexto inteiro, isso fazia telas sem nenhuma relação com o que mudou
  // (ex: Layout, MinhaArea, Dashboard) re-renderizarem do mesmo jeito.
  // Memoizando o value (com as funções já estáveis via useCallback acima),
  // esses consumidores só re-renderizam quando um dado que eles realmente
  // usam muda de verdade.
  const value = useMemo(
    () => ({
      alunos,
      isLoadingAlunos,
      addAluno,
      updateAluno,
      deleteAluno,
      deleteAlunosBulk,
      assumirAluno,
      delegarAluno,
      criarMatriculaVinculada,
      desvincularMatricula,
      addInteraction,
      getAluno,
      filteredAlunos,
      filters,
      setFilters,
      importAlunos,
      importAlunosEngajamento,
      exportAlunos,
      isAdmin,
      isSupervisor,
      canGerenciarPolo,
      statusResumo,
      colaboradores,
      polos,
    }),
    [
      alunos,
      isLoadingAlunos,
      addAluno,
      updateAluno,
      deleteAluno,
      deleteAlunosBulk,
      assumirAluno,
      delegarAluno,
      criarMatriculaVinculada,
      desvincularMatricula,
      addInteraction,
      getAluno,
      filteredAlunos,
      filters,
      importAlunos,
      importAlunosEngajamento,
      exportAlunos,
      isAdmin,
      isSupervisor,
      canGerenciarPolo,
      statusResumo,
      colaboradores,
      polos,
    ]
  );

  return (
    <AlunosContext.Provider value={value}>{children}</AlunosContext.Provider>
  );
};