import React, { useState, useEffect, useMemo, ReactNode } from "react";
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

  useEffect(() => {
    const loadAlunos = async () => {
      if (!user) {
        setAlunos([]);
        setStatusResumo([]);
        setColaboradores([]);
        setIsLoadingAlunos(false);
        return;
      }

      setIsLoadingAlunos(true);

      try {
        const { alunos: fetchedAlunos, error } = await getAlunos();

        if (error) {
          console.error("Erro ao carregar alunos:", error);
        } else {
          setAlunos(fetchedAlunos);
        }

        const { resumo, error: resumoError } = await getPipelineResumo();
        if (resumoError) {
          console.error("Erro ao carregar resumo do pipeline:", resumoError);
        } else {
          setStatusResumo(resumo);
        }

        if (isAdmin) {
          const { colaboradores: fetchedColaboradores, error: colaboradoresError } =
            await getColaboradoresService();
          if (colaboradoresError) {
            console.error("Erro ao carregar colaboradores:", colaboradoresError);
          } else {
            setColaboradores(fetchedColaboradores);
          }
        }
      } finally {
        // Só marca como "carregado" depois que a busca (com sucesso ou erro)
        // termina — evita que telas como AlunoForm achem que o aluno não
        // existe só porque a lista ainda não chegou do banco.
        setIsLoadingAlunos(false);
      }
    };

    loadAlunos();
  }, [user, isAdmin]);

  const addAluno = async (
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
  };

  const updateAluno = async (id: string, updatedData: Partial<Aluno>) => {
    const { aluno, error } = await updateAlunoService(id, updatedData);

    if (error) {
      console.error("Erro ao atualizar aluno:", error);
      throw new Error(error);
    }

    if (aluno) {
      setAlunos((prev) => prev.map((a) => (a.id === id ? aluno : a)));
    }
  };

  const deleteAluno = async (id: string) => {
    const { error } = await deleteAlunoService(id);

    if (error) {
      console.error("Erro ao deletar aluno:", error);
      throw new Error(error);
    }

    setAlunos((prev) => prev.filter((aluno) => aluno.id !== id));
  };

  const deleteAlunosBulk = async (ids: string[]) => {
    if (ids.length === 0) return 0;

    const { error, deletedCount } = await deleteAlunosBulkService(ids);

    if (error) {
      console.error("Erro ao deletar alunos em massa:", error);
      throw new Error(error);
    }

    setAlunos((prev) => prev.filter((aluno) => !ids.includes(aluno.id)));
    return deletedCount;
  };

  const assumirAluno = async (id: string) => {
    if (!user) throw new Error("Usuário não autenticado");

    const { aluno, error } = await assumirAlunoService(id, user.id);

    if (error) {
      console.error("Erro ao assumir aluno:", error);
      throw new Error(error);
    }

    if (aluno) {
      setAlunos((prev) => prev.map((a) => (a.id === id ? aluno : a)));
    }
  };

  const delegarAluno = async (id: string, colaboradorId: string) => {
    const { aluno, error } = await delegarAlunoService(id, colaboradorId);

    if (error) {
      console.error("Erro ao delegar aluno:", error);
      throw new Error(error);
    }

    if (aluno) {
      setAlunos((prev) => prev.map((a) => (a.id === id ? aluno : a)));
    }
  };

  // Otimização 5.3: em vez de recarregar TODOS os alunos após adicionar
  // uma interação, buscamos apenas o aluno afetado e atualizamos ele
  // localmente na lista.
  const addInteraction = async (
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
  };

  const getAluno = (id: string): Aluno | undefined => {
    return alunos.find((aluno) => aluno.id === id);
  };

  // Otimização 5.2: useMemo evita recalcular o filtro em todo re-render,
  // só refaz o filtro quando `alunos` ou `filters` realmente mudam.
  const filteredAlunos = useMemo(() => {
    return alunos.filter((aluno) => {
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
  const importAlunos = async (
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
      return;
    }

    // Em vez de 1 requisição por aluno (o que trava o navegador com
    // centenas de conexões simultâneas), agrupamos em lotes: poucas
    // requisições, cada uma já inserindo várias linhas de uma vez.
    const batchSize = 200;
    let done = 0;
    const createdAlunos: Aluno[] = [];
    const errors: string[] = [];

    for (let i = 0; i < alunosData.length; i += batchSize) {
      const batch = alunosData.slice(i, i + batchSize);
      const { alunos: inserted, errors: batchErrors } = await createAlunosBulk(
        batch,
        batchSize
      );
      createdAlunos.push(...inserted);
      errors.push(...batchErrors);
      done += batch.length;
      onProgress?.(Math.min(done, total), total);
    }

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
  };

  // Otimização 5.1: também usa import dinâmico do xlsx na exportação.
  const exportAlunos = async (): Promise<void> => {
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
  };

  return (
    <AlunosContext.Provider
      value={{
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
        exportAlunos,
        isAdmin,
        statusResumo,
        colaboradores,
      }}
    >
      {children}
    </AlunosContext.Provider>
  );
};