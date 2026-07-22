// Tipos principais do sistema

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: "admin" | "colaborador";
}

export type AlunoStatus =
  | "cadastrado"
  | "pendente"
  | "contatado"
  | "aguardando_retorno"
  | "confirmado"
  | "documentacao"
  | "aguardando_matricula"
  | "matricula_confirmada"
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
  statusAtualizadoEm: Date; // desde quando o aluno está no status atual (usado no score de risco de evasão)
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

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

export interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface ConfirmContextType {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
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

// ---- Risco de Evasão ----

export type FaixaRisco = "baixo" | "medio" | "alto" | "critico";

export interface AlunoRisco {
  aluno: Aluno;
  score: number;
  faixa: FaixaRisco;
  diasNoStatus: number;
  detalhes: {
    pontosStatus: number;
    pontosTags: number;
    multiplicadorTempo: number;
  };
}

// ---- Notificações ----

export type NotificacaoTipo = "mudanca_status" | "nova_interacao" | "recado_admin";

export interface Notificacao {
  id: string;
  paraUserId: string;
  deUserId: string | null;
  deUserNome?: string;
  tipo: NotificacaoTipo;
  titulo: string;
  corpo: string | null;
  alunoId: string | null;
  lida: boolean;
  createdAt: string;
}

export interface NotificacoesContextType {
  notificacoes: Notificacao[];
  naoLidas: number;
  isLoading: boolean;
  marcarLida: (id: string) => Promise<void>;
  marcarTodasLidas: () => Promise<void>;
  enviarRecado: (paraUserId: string, titulo: string, corpo: string) => Promise<void>;
}

// ---- Métricas ----

export interface MetricasGerais {
  totalAlunos: number;
  rematriculados: number;
  taxaConversao: number;
  valorRecuperado: number;
  valorTotalCarteira: number;
  interacoesHoje: number;
  alunosSemResponsavel: number;
}

export interface MetricaColaborador {
  colaboradorId: string;
  colaboradorNome: string;
  totalAlunos: number;
  rematriculados: number;
  desistentes: number;
  confirmados: number;
  pendentes: number;
  valorRecuperado: number;
  valorTotalCarteira: number;
  totalInteracoes: number;
  taxaConversao: number;
}

export interface MetricaCanal {
  canal: string;
  total: number;
  rematriculados: number;
  taxaConversao: number;
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
  deleteAlunosBulk: (ids: string[]) => Promise<number>;
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