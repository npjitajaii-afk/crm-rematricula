// Tipos principais do sistema

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: "admin" | "colaborador";
}

export type AlunoStatus =
  | "pendente"
  | "contatado"
  | "aguardando_retorno"
  | "confirmado"
  | "documentacao"
  | "rematriculado"
  | "desistente";

export type CanalContato =
  | "telefone"
  | "whatsapp"
  | "email"
  | "presencial"
  | "ava"
  | "indicacao"
  | "outro";

export interface Interacao {
  id: string;
  alunoId: string;
  type: "email" | "telefone" | "whatsapp" | "presencial" | "nota" | "outro";
  description: string;
  date: Date;
  userId: string;
  userName: string;
}

export interface Aluno {
  id: string;
  name: string;
  email: string;
  phone: string;
  ra?: string;
  curso?: string;
  turno?: string;
  status: AlunoStatus;
  source: CanalContato;
  value?: number; // valor/débito pendente (mensalidade em aberto)
  observations?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
  interactions: Interacao[];
  assignedTo?: string;
  createdBy: string;
}

export interface AlunoFilters {
  search?: string;
  status?: AlunoStatus[];
  source?: CanalContato[];
  dateFrom?: Date;
  dateTo?: Date;
  assignedTo?: string;
}

export interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface PipelineStatusResumo {
  status: AlunoStatus;
  total: number;
  totalValorPendente: number;
}

export interface AlunosContextType {
  alunos: Aluno[];
  addAluno: (
    aluno: Omit<
      Aluno,
      "id" | "createdAt" | "updatedAt" | "interactions" | "createdBy"
    > & { createdBy?: string }
  ) => Promise<void>;
  updateAluno: (id: string, aluno: Partial<Aluno>) => Promise<void>;
  deleteAluno: (id: string) => Promise<void>;
  deleteAlunosBulk: (ids: string[]) => Promise<void>;
  assumirAluno: (id: string) => Promise<void>;
  delegarAluno: (id: string, colaboradorId: string) => Promise<void>;
  addInteraction: (
    alunoId: string,
    interaction: Omit<Interacao, "id" | "alunoId">
  ) => Promise<void>;
  getAluno: (id: string) => Aluno | undefined;
  filteredAlunos: Aluno[];
  filters: AlunoFilters;
  setFilters: (filters: AlunoFilters) => void;
  importAlunos: (
    file: File,
    onProgress?: (done: number, total: number) => void
  ) => Promise<void>;
  exportAlunos: () => void;
  isAdmin: boolean;
  statusResumo: PipelineStatusResumo[];
  colaboradores: { id: string; name: string; email: string }[];
}
