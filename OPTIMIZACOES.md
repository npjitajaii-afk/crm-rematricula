# Otimizações de performance (CRM Rematrícula)

Resumo do que foi implementado em relação ao diagnóstico de payload pesado no login e concorrência com ~40 usuários.

## Fase 1 — Listagem leve (maior impacto)

- `alunosService`: `SELECT_LISTA` sem `interacoes`; histórico só em `getAlunoById` / detalhe.
- Paginação em lotes (`PAGE_SIZE = 100`) com `onPage` para liberar a UI no 1º lote.
- Login carrega só a área da rota (`somenteAreaPrioritaria`); outras áreas via `ensureAreaLoaded`.
- Modal e `AlunoDetails` buscam versão completa sob demanda.

## Fase 2 — Bootstrap paralelo e providers sob demanda

- Meta (pipeline + colaboradores + polos) em `Promise.all` paralelo à 1ª página de alunos.
- **Checklist**: só em rotas de engajamento / detalhe; carga adiada ~350ms.
- **WhatsApp**: só em rotas de funil (Kanban); carga adiada ~400ms.
- **Tarefas / Agenda**: só em rotas de tarefas, agenda, calendário, painel.
- **Notificações**: limite 50; realtime só INSERT do usuário; lembrete de boleto atrasado 8s; lista limitada a 50 no realtime.

## Fase 3 — Banco e escala

Migration `database/022_indices_performance_lista.sql`:

```sql
idx_alunos_polo_area_created   (polo_id, area, created_at DESC)
idx_alunos_polo_responsavel    (polo_id, responsavel_id)
idx_interacoes_aluno_created   (aluno_id, created_at DESC)
```

Aplicar no Supabase (SQL Editor ou CLI).

- Delete em massa já em chunks de 50; aviso extra acima de 100 itens.
- Realtime seletivo: canais só quando a rota precisa (checklist, whatsapp, tarefas).

## Kanban / Meus Contatos (UX)

- Update de status otimista no drag-and-drop.
- Coluna inteira como droppable + destaque visual ao passar o card.
- Pan do quadro desligado durante o arraste do card.
- Clique no card não abre modal se houve drag.

## Como validar

1. Login em Rematrícula: lista em ~1–2s; network sem query pesada de interações.
2. Abrir Engajamento: checklist/whatsapp só depois (ou sob demanda).
3. Arrastar card em Meus Contatos: coluna destaca e status muda na hora.
4. Rodar a migration 022 em staging e conferir `EXPLAIN` nas listagens por polo/área.
