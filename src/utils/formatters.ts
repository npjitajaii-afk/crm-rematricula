// Utilitários para formatação e máscaras

export const formatPhone = (value: string): string => {
  const numbers = value.replace(/\D/g, '');
  
  if (numbers.length <= 10) {
    return numbers.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  }
  return numbers.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
};

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

export const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return '-';
  
  try {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) return '-';
    
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(dateObj);
  } catch {
    return '-';
  }
};

export const formatDateTime = (date: Date | string | null | undefined): string => {
  if (!date) return '-';
  
  try {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) return '-';
    
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dateObj);
  } catch {
    return '-';
  }
};

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePhone = (phone: string): boolean => {
  const numbers = phone.replace(/\D/g, '');
  return numbers.length >= 10 && numbers.length <= 11;
};

export const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    // Rematrícula
    'cadastrado': '#7C8CA6',
    'pendente': '#9CA3AF',
    'contatado': '#4DBDBD',
    'aguardando_retorno': '#FFD600',
    'confirmado': '#00A9AA',
    'documentacao': '#E0B400',
    'aguardando_matricula': '#F5920A',
    'matricula_confirmada': '#3B82F6',
    'rematriculado': '#067A7B',
    'desistente': '#ef4444',
    'retido': '#8B5CF6',
    // Retenção
    'recebido': '#9CA3AF',
    'tentativa_contato': '#4DBDBD',
    'contato_realizado': '#00A9AA',
    'diagnostico': '#FFD600',
    'proposta_enviada': '#F5920A',
    'aguardando_decisao': '#3B82F6',
    'recuperado': '#22C55E',
    'perdido': '#ef4444',
    // Engajamento
    'novo_cadastro': '#7C8CA6',
    'primeiro_contato': '#00A9AA',
    'acompanhamento': '#3B82F6',
    'engajado': '#22C55E',
    'estabilizado': '#067A7B',
  };
  return colors[status] || '#6b7280';
};

export const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    // Rematrícula
    'cadastrado': 'Cadastrado',
    'pendente': 'Pendente de Contato',
    'contatado': 'Contato Realizado',
    'aguardando_retorno': 'Aguardando Retorno',
    'confirmado': 'Confirmou Interesse',
    'documentacao': 'Documentação/Pagamento',
    'aguardando_matricula': 'Aguardando Matrícula',
    'matricula_confirmada': 'Matrícula Confirmada',
    'rematriculado': 'Rematriculado',
    'desistente': 'Desistente',
    'retido': 'Retido',
    // Retenção
    'recebido': 'Recebido',
    'tentativa_contato': 'Tentativa de Contato',
    'contato_realizado': 'Contato Realizado',
    'diagnostico': 'Diagnóstico do Motivo',
    'proposta_enviada': 'Proposta Enviada',
    'aguardando_decisao': 'Aguardando Decisão',
    'recuperado': 'Recuperado',
    'perdido': 'Perdido',
    // Engajamento
    'novo_cadastro': 'Novo Cadastro',
    'primeiro_contato': 'Primeiro Contato',
    'acompanhamento': 'Acompanhamento Ativo',
    'engajado': 'Engajado',
    'estabilizado': 'Estabilizado',
  };
  return labels[status] || status;
};

export const getSourceLabel = (source: string): string => {
  const labels: Record<string, string> = {
    'telefone': 'Telefone',
    'whatsapp': 'WhatsApp',
    'email': 'E-mail',
    'presencial': 'Presencial',
    'ava': 'AVA / Portal do Aluno',
    'indicacao': 'Indicação',
    'outro': 'Outro',
  };
  return labels[source] || source;
};


export const getTipoAlunoColor = (tipo: string): string => {
  const colors: Record<string, string> = {
    'Calouro': '#00A9AA',
    'Veterano': '#282828',
    'Winback': '#E0B400',
  };
  return colors[tipo] || '#6b7280';
};

export const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
};
