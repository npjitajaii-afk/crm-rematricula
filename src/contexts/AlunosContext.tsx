import React, { useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { Aluno, AlunoFilters, Interacao, PipelineStatusResumo } from "../types";
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
  getPipelineResumo,
  getColaboradores as getColaboradoresService,
  addInteraction as addInteractionService,
} from "../services/alunosService";
import { useAuth } from "../hooks/useAuth";
import { AlunosContext } from "./alunos-context";

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
    { id: string; name: string; email: string }[]
  >([]);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Detecta a área do funil que o usuário está abrindo (pela URL atual) pra
  // priorizar essa busca primeiro. Lida direto com window.location (em vez
  // de useLocation) de propósito: só precisa da rota no momento do login/
  // refresh, e não deve disparar um novo carregamento completo sempre que o
  // usuário navega entre abas depois — ver README.md, Bloco B.
  const detectarAreaAtivaPelaRota = (pathname: string): Aluno["area"] | undefined => {
    if (pathname.startsWith("/retencao")) return "retencao";
    if (pathname.startsWith("/engajamento")) return "engajamento";
    if (pathname.startsWith("/alunos") || pathname.startsWith("/meus-contatos"))
      return "rematricula";
    return undefined; // outras rotas (início, métricas, etc.) não têm uma área única pra priorizar
  };

  useEffect(() => {
    let cancelado = false;

    const loadAlunos = async () => {
      if (!user) {
        setAlunos([]);
        setStatusResumo([]);
        setColaboradores([]);
        setIsLoadingAlunos(false);
        return;
      }

      setIsLoadingAlunos(true);
      let primeiroLoteChegou = false;

      try {
        const areaAtiva = detectarAreaAtivaPelaRota(window.location.pathname);

        // Antes: uma única query sem paginação trazia TODOS os alunos de
        // TODAS as áreas com o histórico de interações aninhado, e só
        // depois disso a tela desenhava (é a causa da lentidão logo após o
        // login). Agora: busca em lotes, priorizando a área que o usuário
        // está abrindo — a tela já libera assim que o primeiro lote chega,
        // enquanto o restante continua carregando por trás.
        const { error } = await getAlunos({
          areaPrioritaria: areaAtiva,
          onPage: (parcial) => {
            if (cancelado) return;
            setAlunos(parcial);
            if (!primeiroLoteChegou) {
              primeiroLoteChegou = true;
              setIsLoadingAlunos(false);
            }
          },
        });

        if (error) {
          console.error("Erro ao carregar alunos:", error);
        }

        const { resumo, error: resumoError } = await getPipelineResumo();
        if (!cancelado) {
          if (resumoError) {
            console.error("Erro ao carregar resumo do pipeline:", resumoError);
          } else {
            setStatusResumo(resumo);
          }
        }

        if (isAdmin) {
          const { colaboradores: fetchedColaboradores, error: colaboradoresError } =
            await getColaboradoresService();
          if (!cancelado) {
            if (colaboradoresError) {
              console.error("Erro ao carregar colaboradores:", colaboradoresError);
            } else {
              setColaboradores(fetchedColaboradores);
            }
          }
        }
      } finally {
        // Rede de segurança: se não veio nenhum lote (ex: usuário sem
        // nenhum aluno cadastrado ainda), garante que o loading não fica
        // preso pra sempre.
        if (!cancelado) setIsLoadingAlunos(false);
      }
    };

    loadAlunos();

    return () => {
      cancelado = true;
    };
  }, [user, isAdmin]);

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
    [user]
  );

  const updateAluno = useCallback(
    async (id: string, updatedData: Partial<Aluno>) => {
      const { aluno, error } = await updateAlunoService(id, updatedData);

      if (error) {
        console.error("Erro ao atualizar aluno:", error);
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
        if (aluno.assignedTo !== filters.assignedTo) return false;
      }

      return true;
    });
  }, [alunos, filters]);

  /**
   * Normaliza as chaves de uma linha da planilha (remove acentos, espaços e
   * deixa tudo em maiúsculas) para permitir casar com múltiplos formatos de
   * cabeçalho, ex: "NOME_ALUNO", "Nome Aluno", "nome" etc.
   */
  const normalizeRow = (row: Record<string, unknown>): Record<string, string> => {
    const normalized: Record<string, string> = {};
    Object.entries(row).forEach(([key, value]) => {
      const normalizedKey = key
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_");
      normalized[normalizedKey] = value != null ? String(value).trim() : "";
    });
    return normalized;
  };

  const pickField = (row: Record<string, string>, keys: string[]): string => {
    for (const key of keys) {
      if (row[key]) return row[key];
    }
    return "";
  };

  /**
   * Converte uma linha já normalizada da planilha nos dados de um aluno.
   * Extraído do importAlunos para não recriar a função a cada linha.
   */
  const rowToAlunoData = (
    rawRow: unknown,
    userId: string
  ): Omit<Aluno, "id" | "createdAt" | "updatedAt" | "interactions"> | null => {
    const r = normalizeRow(rawRow as Record<string, unknown>);

    // Planilha de rematrícula (ex: CODIGO_ALUNO, NOME_ALUNO, FONE, EMAIL,
    // STATUS, STATUS_ALUNO, TIPO, NOME_CURSO), com fallback pros nomes
    // genéricos usados no template de exportação/importação antigo.
    const nome = pickField(r, ["NOME_ALUNO", "NOME", "NAME"]);
    const email = pickField(r, ["EMAIL"]);
    const telefone = pickField(r, ["FONE", "TELEFONE", "PHONE"]);

    // Linha vazia ou sem nenhum dado útil: ignora em vez de mandar pro banco.
    if (!nome && !email && !telefone) return null;

    const codigoAluno = pickField(r, ["CODIGO_ALUNO", "RA", "MATRICULA"]);
    const curso = pickField(r, ["NOME_CURSO", "CURSO"]);
    const turno = pickField(r, ["TURNO"]);

    // Campos específicos da planilha de rematrícula: viram tags no card
    // (ex: "Veterano", "Cadastrado") e a situação de renovação vira
    // observação, já que não é um dos status do funil interno.
    const tipoAluno = pickField(r, ["TIPO"]); // Calouro / Veterano / Winback
    const statusAluno = pickField(r, ["STATUS_ALUNO"]); // ex: Cadastrado
    const statusRenovacao = pickField(r, ["STATUS"]); // ex: Não Renovado

    const tagsPlanilha = pickField(r, ["TAGS"]);
    const tags = [
      tipoAluno,
      statusAluno,
      ...(tagsPlanilha ? tagsPlanilha.split(",").map((t) => t.trim()) : []),
    ].filter(Boolean);

    const observacoesPlanilha = pickField(r, ["OBSERVACOES", "OBSERVATIONS"]);
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
      source: (pickField(r, ["CANAL", "CANAL_CONTATO", "ORIGEM"]) ||
        "outro") as Aluno["source"],
      value:
        parseFloat(pickField(r, ["VALOR", "VALOR_PENDENTE"]) || "0") ||
        undefined,
      observations: observations || undefined,
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
          resolve(XLSX.utils.sheet_to_json(worksheet));
        } catch {
          reject(new Error("Erro ao processar arquivo"));
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
          const sheetName = workbook.SheetNames.find(
            (name) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() === "SITE + APP"
          );
          if (!sheetName) return reject(new Error('A planilha precisa conter a aba "Site + App".'));
          const worksheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "" });
          const headerRow = rows.findIndex((row) => row.some((cell) => String(cell)
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase() === "POLO"));
          if (headerRow < 0) return reject(new Error('Não foi encontrada a coluna "Polo" na aba "Site + App".'));
          resolve(XLSX.utils.sheet_to_json(worksheet, { range: headerRow, defval: "" }));
        } catch {
          reject(new Error("Erro ao processar arquivo"));
        }
      };
      reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
      reader.readAsBinaryString(file);
    });

    const normalizeRow = (rawRow: unknown): Record<string, string> => {
      const normalized: Record<string, string> = {};
      Object.entries(rawRow as Record<string, unknown>).forEach(([key, value]) => {
        const normalizedKey = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
        normalized[normalizedKey] = value != null ? String(value).trim() : "";
      });
      return normalized;
    };
    const pick = (row: Record<string, string>, keys: string[]) => {
      const key = keys.find((item) => row[item]);
      return key ? row[key] : "";
    };
    const normalizedText = (value: string) => value.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLowerCase();

    let ignored = 0;
    const alunosData = jsonData.map((rawRow) => {
      const row = normalizeRow(rawRow);
      const polo = pick(row, ["POLO"]);
      if (!normalizedText(polo).includes("itajai")) { ignored += 1; return null; }
      const name = pick(row, ["NOME", "NOME_ALUNO", "NAME"]);
      const email = pick(row, ["E_MAIL", "EMAIL"]);
      const phone = pick(row, ["CELULAR", "TELEFONE", "FONE", "PHONE"]);
      if (!name && !email && !phone) { ignored += 1; return null; }

      const cpf = pick(row, ["CPF"]);
      const tipoEntrada = pick(row, ["TIPO_DE_ENTRADA", "TIPO"]);
      const canal = pick(row, ["CANAL_DA_MATRICULA", "CANAL"]);
      const plataforma = pick(row, ["PLATAFORMA_DETALHE", "PLATAFORMA"]);
      const dataMatricula = pick(row, ["DATA_MATRICULA"]);
      const observacoes = [
        canal && `Canal da matrícula: ${canal}`,
        plataforma && `Plataforma: ${plataforma}`,
        tipoEntrada && `Tipo de entrada: ${tipoEntrada}`,
        dataMatricula && `Data da matrícula: ${dataMatricula}`,
      ].filter(Boolean).join(" | ");

      const aluno: Omit<Aluno, "id" | "createdAt" | "updatedAt" | "interactions"> = {
        name, email, phone,
        ra: pick(row, ["CODIGO_INSCRICAO", "RA", "MATRICULA"]) || undefined,
        curso: pick(row, ["CURSO", "NOME_CURSO"]) || undefined,
        area: "engajamento" as const,
        status: "novo_cadastro" as Aluno["status"],
        statusAtualizadoEm: new Date(),
        source: "outro" as Aluno["source"],
        observations: observacoes || undefined,
        tags: [`Polo: ${polo}`, cpf && `CPF: ${cpf}`, tipoEntrada].filter(Boolean),
        createdBy: user.id,
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
  }, [user]);

  // Otimização 5.1: também usa import dinâmico do xlsx na exportação.
  const exportAlunos = useCallback(async (): Promise<void> => {
    const dataToExport = filteredAlunos.map((aluno) => ({
      Nome: aluno.name,
      Email: aluno.email,
      Telefone: aluno.phone,
      RA: aluno.ra || "",
      Curso: aluno.curso || "",
      Turno: aluno.turno || "",
      Status: aluno.status,
      Canal: aluno.source,
      "Valor Pendente": aluno.value || 0,
      "Data Criação": new Date(aluno.createdAt).toLocaleDateString("pt-BR"),
      Observações: aluno.observations || "",
    }));

    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Alunos");

    const fileName = `alunos-rematricula-${
      new Date().toISOString().split("T")[0]
    }.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }, [filteredAlunos]);

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
      addInteraction,
      getAluno,
      filteredAlunos,
      filters,
      setFilters,
      importAlunos,
      importAlunosEngajamento,
      exportAlunos,
      isAdmin,
      statusResumo,
      colaboradores,
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
      addInteraction,
      getAluno,
      filteredAlunos,
      filters,
      importAlunos,
      importAlunosEngajamento,
      exportAlunos,
      isAdmin,
      statusResumo,
      colaboradores,
    ]
  );

  return (
    <AlunosContext.Provider value={value}>{children}</AlunosContext.Provider>
  );
};
