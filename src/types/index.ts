// Tipos principais do sistema

// ---- Áreas operacionais ----
// Cada área é um funil próprio na mesma tabela de alunos. Ver README.md.
export type Area = "rematricula" | "retencao" | "engajamento";

// Status de aprovação de cadastro (ver 007_aprovacao_e_areas_acesso.sql).
// pendente = aguardando aprovação do admin; aprovado = acesso liberado;
// rejeitado = cadastro recusado.
export type StatusAprovacao = "pendente" | "aprovado" | "rejeitado";

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: "admin" | "colaborador";
  status: StatusAprovacao;
  // Áreas que o colaborador pode ver/editar. Ignorado quando role = admin
  // (admin sempre tem acesso a todas as áreas).
  areasPermitidas: Area[];
}

export type StatusRematricula =
  | "cadastrado"
  | "pendente"
  | "contatado"
  | "aguardando_retorno"
  | "confirmado"
  | "documentacao"
  | "aguardando_matricula"
  | "matricula_confirmada"
  | "rematriculado"
  | "desistente"
  | "retido"; // chegada automática vinda da Retenção (aluno recuperado)

export type StatusRetencao =
  | "recebido"
  | "tentativa_contato"
  | "contato_realizado"
  | "diagnostico"
  | "proposta_enviada"
  | "aguardando_decisao"
  | "recuperado" // dispara trigger -> volta pra Rematrícula como "retido"
  | "perdido";

export type StatusEngajamento =
  | "novo_cadastro"
  | "primeiro_contato"
  | "acompanhamento"
  | "engajado"
  | "desistente"
  | "estabilizado";

export type AlunoStatus = StatusRematricula | StatusRetencao | StatusEngajamento;

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
  area: Area;
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
  area?: Area;
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

// ---- Checklist de Engajamento / Rematrícula ----
// Tarefas fixas criadas automaticamente (via trigger no banco, ver
// database/009_checklist_engajamento.sql) para todo aluno que entra na
// área "engajamento". O colaborador vai marcando conforme confirma cada
// etapa de ambientação do calouro.
// As mesmas linhas (tabela engajamento_checklist_itens) também são
// criadas para alunos da área "rematricula", com outro conjunto de
// itens — ver database/016_checklist_rematricula.sql.
export type ChecklistItemKey =
  | "login_leo_app"
  | "acessou_teams"
  | "assistiu_aulas"
  | "acessou_livros"
  | "fez_av1"
  | "fez_av4"
  | "pagou_primeiro_boleto"
  | "email_enviado"
  | "whatsapp_enviado"
  | "possui_horas_extensao"
  | "possui_horas_complementares"
  | "aceite_contrato";

export interface ChecklistItem {
  id: string;
  alunoId: string;
  itemKey: ChecklistItemKey | string;
  label: string;
  ordem: number;
  concluido: boolean;
  concluidoPor?: string;
  concluidoPorNome?: string;
  concluidoEm?: Date;
}

export interface ChecklistContextType {
  /** Itens de checklist agrupados por alunoId (só existe para alunos da área "engajamento"). */
  itensPorAluno: Record<string, ChecklistItem[]>;
  isLoading: boolean;
toggleItem: (item: ChecklistItem, concluido: boolean) => Promise<void>;
}
// ---- Tarefas pessoais (Engajamento) ----
// Tarefas criadas pelo colaborador na aba "Tarefas" do funil de Engajamento.
// Só o dono vê as suas; admin vê todas. Podem ter data, aluno vinculado,
// anotações e checklist interno.
export type TarefaPessoalStatus = "em_andamento" | "concluido";
export interface TarefaChecklistItem {
  id: string;
  tarefaId: string;
  texto: string;
  concluido: boolean;
  ordem: number;
}
export interface TarefaPessoal {
  id: string;
  userId: string;
  userName?: string;
  alunoId?: string;
  alunoNome?: string;
  titulo: string;
  anotacoes?: string;
  status: TarefaPessoalStatus;
  prazo?: Date;
  checklist: TarefaChecklistItem[];
  createdAt: Date;
  updatedAt: Date;
}
export interface TarefasEngajamentoContextType {
  tarefas: TarefaPessoal[];
  isLoading: boolean;
  criarTarefa: (dados: {
    titulo: string;
    anotacoes?: string;
    alunoId?: string;
    prazo?: Date;
    checklist?: { texto: string }[];
  }) => Promise<void>;
  atualizarTarefa: (
    id: string,
    dados: Partial<{
      titulo: string;
      anotacoes: string;
      alunoId: string | null;
      prazo: Date | null;
      status: TarefaPessoalStatus;
    }>
  ) => Promise<void>;
  excluirTarefa: (id: string) => Promise<void>;
  toggleChecklistItem: (itemId: string, concluido: boolean) => Promise<void>;
  adicionarChecklistItem: (tarefaId: string, texto: string) => Promise<void>;
  removerChecklistItem: (itemId: string) => Promise<void>;
}

// ---- Agenda pessoal (Engajamento) ----
export interface AgendaCompromisso {
  id: string;
  userId: string;
  alunoId: string;
  alunoNome?: string;
  data: Date;
  ticket?: string;
  comentario: string;
  createdAt: Date;
}
export interface AgendaEngajamentoContextType {
  compromissos: AgendaCompromisso[];
  isLoading: boolean;
  criarCompromisso: (dados: { alunoId: string; data: Date; ticket?: string; comentario: string }) => Promise<void>;
  excluirCompromisso: (id: string) => Promise<void>;
}
// ---- Mensagens de WhatsApp (Evolution API) ----
export type WhatsappDirecao = "recebida" | "enviada";

export interface WhatsappMensagem {
  id: string;
  alunoId: string | null;
  telefone: string;
  direcao: WhatsappDirecao;
  tipoMensagem: string;
  mensagem: string | null;
  lida: boolean;
  createdAt: Date;
}

export interface WhatsappResumo {
  naoLidas: number;
  ultimaMensagem: string | null;
  ultimaDirecao: WhatsappDirecao | null;
  ultimaMensagemEm: Date | null;
}

export interface WhatsappContextType {
  /** Resumo (não lidas + última mensagem) por alunoId, para o badge no card. */
  resumoPorAluno: Record<string, WhatsappResumo>;
  isLoading: boolean;
  marcarComoLida: (alunoId: string) => Promise<void>;
}

// ---- Alerta de inatividade (Engajamento) ----

export type NivelAlertaInatividade = "atencao" | "critico";

export interface AlertaInatividade {
  alunoId: string;
  diasSemInteracao: number;
  nivel: NivelAlertaInatividade;
}

// ---- Notificações ----

export type NotificacaoTipo = "mudanca_status" | "nova_interacao" | "recado_admin" | "lembrete_boleto" | "lembrete_boleto_rematricula";

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

// ---- Gestão de usuários (tela de Usuários, admin-only) ----

export interface Usuario {
  id: string;
  name: string;
  email: string;
  role: "admin" | "colaborador";
  status: StatusAprovacao;
  areasPermitidas: Area[];
  createdAt: Date;
}

export interface AlunosContextType {
  alunos: Aluno[];
  isLoadingAlunos: boolean;
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
  importAlunosEngajamento: (
    file: File,
    onProgress?: (done: number, total: number) => void
  ) => Promise<{ imported: number; ignored: number }>;
  exportAlunos: () => void;
  isAdmin: boolean;
  statusResumo: PipelineStatusResumo[];
  colaboradores: { id: string; name: string; email: string }[];
}