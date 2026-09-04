// Tipos principais do sistema

// ---- Áreas operacionais ----
// Cada área é um funil próprio na mesma tabela de alunos. Ver README.md.
export type Area = "rematricula" | "retencao" | "engajamento";

// Status de aprovação de cadastro (ver 007_aprovacao_e_areas_acesso.sql).
// pendente = aguardando aprovação do admin; aprovado = acesso liberado;
// rejeitado = cadastro recusado.
export type StatusAprovacao = "pendente" | "aprovado" | "rejeitado";

// Papel de acesso (ver 019_supervisor_e_isolamento_polo.sql).
// admin: vê/autoriza tudo, todos os polos.
// supervisor: vê/exclui/delega contatos e métricas só do próprio polo,
//   não autoriza usuários. Precisa ter poloId definido.
// colaborador: só os próprios contatos, dentro do polo.
export type UserRole = "admin" | "supervisor" | "colaborador";

export interface Polo {
  id: string;
  nome: string;
  createdAt: Date;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: UserRole;
  status: StatusAprovacao;
  // Áreas que o colaborador pode ver/editar. Ignorado quando role = admin
  // (admin sempre tem acesso a todas as áreas).
  areasPermitidas: Area[];
  /** Polo do colaborador. Admin pode ficar sem polo (vê todos). */
  poloId?: string;
  poloNome?: string;
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
  poloId: string;
  poloNome?: string;
  /** ID da matrícula vinculada — mesmo aluno, outro curso/edital. */
  matriculaVinculadaId?: string;
}

export interface AlunoFilters {
  search?: string;
  area?: Area;
  status?: AlunoStatus[];
  source?: CanalContato[];
  dateFrom?: Date;
  dateTo?: Date;
  assignedTo?: string;
  poloId?: string;
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
  register: (name: string, email: string, password: string, poloId?: string) => Promise<void>;
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

// ---- Checklist de Engajamento ----
export type ChecklistItemKey =
  | "login_leo_app"
  | "acessou_teams"
  | "assistiu_aulas"
  | "acessou_livros"
  | "fez_av1"
  | "fez_av4"
  | "pagou_primeiro_boleto";

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
  itensPorAluno: Record<string, ChecklistItem[]>;
  isLoading: boolean;
  toggleItem: (item: ChecklistItem, concluido: boolean) => Promise<void>;
  /** Garante que a checklist de UM aluno está carregada no estado.
   * Usado por quem renderiza o card/modal desse aluno — não dá pra
   * confiar só no realtime porque ele não repõe linhas que já
   * existiam no banco antes da inscrição no canal (ver
   * ChecklistContext.tsx). Não faz nada se o aluno já está no mapa. */
  garantirItensCarregados: (alunoId: string) => void;
}

// ---- Tarefas pessoais (Engajamento) ----
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

// Status considerados "sucesso" e "terminal" em cada área — usados tanto no
// service (cálculo em JS a partir das linhas brutas de `alunos`) quanto nas
// views SQL de 016_metricas_multi_funil.sql, que replicam a mesma lógica.
export const METRICA_STATUS_SUCESSO: Record<Area, AlunoStatus[]> = {
  rematricula: ["rematriculado"],
  retencao: ["recuperado"],
  engajamento: ["engajado", "estabilizado"],
};

export const METRICA_STATUS_TERMINAL: Record<Area, AlunoStatus[]> = {
  rematricula: ["rematriculado", "desistente"],
  retencao: ["recuperado", "perdido"],
  engajamento: ["estabilizado", "desistente"],
};

export interface MetricasGerais {
  area: Area;
  totalAlunos: number;
  /** Quantos atingiram o status de sucesso da área (ver METRICA_STATUS_SUCESSO). */
  sucesso: number;
  taxaConversao: number;
  /** Valor pendente somado dos que tiveram sucesso (0 em áreas sem componente financeiro). */
  valorPrincipal: number;
  valorTotalCarteira: number;
  interacoesHoje: number;
  alunosSemResponsavel: number;
  /** Média de dias entre criação e chegada ao status de sucesso. Null se não houver nenhum caso ainda. */
  tempoMedioCicloDias: number | null;
}

export interface MetricaColaborador {
  colaboradorId: string;
  colaboradorNome: string;
  totalAlunos: number;
  sucesso: number;
  encerradosSemSucesso: number;
  valorRecuperado: number;
  valorTotalCarteira: number;
  totalInteracoes: number;
  taxaConversao: number;
}

export interface MetricaCanal {
  canal: string;
  total: number;
  sucesso: number;
  taxaConversao: number;
}

// ---- Métricas — visão geral (cabeçalho fixo da tela, todas as áreas) ----
export interface MetricasOverviewGeral {
  totalGeral: number;
  porArea: Record<Area, number>;
  alertasPorArea: Record<Area, number>;
  totalAlertas: number;
}

// ---- Gestão de usuários (tela de Usuários, admin-only) ----

export interface Usuario {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: StatusAprovacao;
  areasPermitidas: Area[];
  poloId?: string;
  poloNome?: string;
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
  criarMatriculaVinculada: (
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
  ) => Promise<void>;
  desvincularMatricula: (alunoId: string) => Promise<void>;
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
  ) => Promise<{ imported: number; duplicados: number }>;
  importAlunosEngajamento: (
    file: File,
    onProgress?: (done: number, total: number) => void
  ) => Promise<{ imported: number; ignored: number; duplicados: number }>;
  exportAlunos: () => void;
  isAdmin: boolean;
  isSupervisor: boolean;
  /** true para quem pode gerenciar o polo inteiro: admin ou supervisor */
  canGerenciarPolo: boolean;
  statusResumo: PipelineStatusResumo[];
  colaboradores: { id: string; name: string; email: string; poloId?: string; poloNome?: string }[];
  polos: Polo[];
}