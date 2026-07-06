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
    'pendente': '#00A9AA',
    'contatado': '#FFD600',
    'aguardando_retorno': '#f97316',
    'confirmado': '#00A9AA',
    'documentacao': '#008080',
    'rematriculado': '#15803d',
    'desistente': '#ef4444',
  };
  return colors[status] || '#6b7280';
};

export const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    'pendente': 'Pendente de Contato',
    'contatado': 'Contato Realizado',
    'aguardando_retorno': 'Aguardando Retorno',
    'confirmado': 'Confirmou Interesse',
    'documentacao': 'Documentação/Pagamento',
    'rematriculado': 'Rematriculado',
    'desistente': 'Desistente',
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
    'Veterano': '#FFD600',
    'Winback': '#f59e0b',
  };
  return colors[tipo] || '#6b7280';
};

export const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
};
