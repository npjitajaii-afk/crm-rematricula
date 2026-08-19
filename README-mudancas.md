# CRM Rematrícula — Diagnóstico e Plano de Mudanças

> Documento técnico de referência para a reestruturação do funil de rematrícula, correção do bug de login e ajustes de performance. Cada seção abaixo vira uma micro-tarefa isolada, na ordem recomendada de execução.

Status geral: **Blocos A, B e C aplicados; D planejado** (ver seção 8).

---

## 1. Diagnóstico — UI aguenta vários contatos/atividades de etapas diferentes ao mesmo tempo?

**Resposta: sim hoje, mas sem teto — risco real em volume de produção.**

**Causa raiz** (`src/services/alunosService.ts` + `src/contexts/AlunosContext.tsx`):
- `getAlunos()` faz `select('*, interacoes(*)')` **sem paginação, sem `.range()`, sem limite**. Puxa todos os alunos de todas as áreas/status de uma vez, com todo o histórico de interações aninhado.
- O `AlunosProvider` guarda esse array inteiro em memória (`useState<Aluno[]>`) e o Kanban só filtra esse array já carregado (`filteredAlunos`, via `useMemo`).
- `KanbanColumn` e `AlunoCard` não usam `React.memo`; não há virtualização de lista (`react-window`/`react-virtualized`). A cada mudança de `filteredAlunos` (um drag, uma edição, uma nova interação), o board inteiro re-renderiza card por card.

**Por que não trava com poucos dados:** com centenas de registros o payload e o re-render são baratos. O problema aparece com milhares de alunos + histórico de interações longo — é o clássico "roda liso em teste, engasga em produção".

**Correção recomendada:**
- Paginar `getAlunos()` no backend (Supabase `.range()`), carregando por área/coluna ou sob demanda (scroll infinito / paginação por coluna do Kanban).
- Memoizar `KanbanColumn` e `AlunoCard` com `React.memo` + comparação por props relevantes.
- Avaliar virtualização de coluna quando uma etapa tiver muitos cards visíveis simultaneamente.

---

## 2. Diagnóstico — Velocidade de abertura logo após o login

**Mesma causa raiz do item 1.**

`getAlunos()` roda de forma bloqueante dentro do `useEffect` do `AlunosProvider`, disparado assim que `user` é setado após o login (`src/contexts/AlunosContext.tsx`). A tela só desenha depois que essa query (com join de interações, sem paginação) volta do Supabase. Quanto mais alunos/interações existirem no banco, mais lenta fica a transição login → primeira tela.

**Correção recomendada:**
- Mesma solução do item 1 (paginação) resolve os dois problemas ao mesmo tempo.
- Complementar: mostrar o layout/skeleton imediatamente e carregar os dados da área ativa primeiro, com o resto sob demanda.

---

## 3. Bug — Usuário aprovado que não consegue logar — ✅ corrigido

**Causa raiz confirmada em `src/services/authService.ts`, função `loginUser`:**

```ts
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) {
  return { user: null, error: 'Email ou senha incorretos' };
}
```

Todo erro retornado pelo `signInWithPassword` é reescrito genericamente como *"Email ou senha incorretos"* — inclusive o erro nativo `Email not confirmed` do Supabase Auth. Esse é um gate **separado** da aprovação feita na aba Usuários (que mexe na coluna `status` de `profiles`). Se a confirmação de e-mail estiver ativada no projeto Supabase (comportamento padrão), o usuário precisa clicar no link enviado por e-mail antes de conseguir logar — **mesmo já aprovado no CRM**. Como a mensagem esconde isso, parece que "confirmei e mesmo assim não entra".

Validado e correto (sem bug): trigger de criação de profile, RLS de update em `profiles`, trigger que protege `status`/`role`/`areas_permitidas`, tela de aprovação, e a lógica de bloqueio por `status !== 'aprovado'` já existente em `loginUser` (essa parte já funciona certo).

**Correção:**
- Em `loginUser`, checar `error.code` (`email_not_confirmed`) ou `error.message` contendo `"Email not confirmed"` antes de cair no genérico.
- Retornar mensagem específica: *"Confirme seu e-mail antes de entrar — verifique a caixa de entrada."*
- Consequência dupla: usuário para de achar que a aprovação não funcionou, e o admin para de receber reclamação de um problema que não é dele.

---

## 4. Reestruturação de navegação — "Funil de Rematrícula"

Consolidar as rotas soltas do menu lateral atual em **abas dentro de uma única página** "Funil de Rematrícula".

### 4.1 Mapeamento de abas

| Aba | Comportamento |
|---|---|
| Início | Mantém como está hoje (`Dashboard.tsx`) |
| Alunos | Mantém como está hoje (`Alunos.tsx`, Kanban de rematrícula) |
| Risco de Evasão | Mantém como está (`RiscoEvasao.tsx`) |
| Métricas | Estrutura preparada para os 3 processos (rematrícula/retenção/engajamento) — rematrícula populado de verdade agora, os outros dois com o encaixe pronto |
| Grupos | Filtros de status + etiqueta (já existem) + **novo filtro por funil** (rematrícula/retenção/engajamento) |
| Colaboradores | Acesso **somente admin** |
| Usuários | Acesso **somente admin** |

### 4.2 Hierarquia de acesso confirmada — Opção 1

- Admin: acessa abas gerais e processos gerais de todas as abas, sem restrição.
- Colaborador: pode ter até **2 áreas liberadas simultaneamente** (nem todo colaborador tem acesso a duas — pode ter só 1).
- Se o colaborador tem 2 áreas liberadas, ele vê normalmente as abas/funções das 2, **sem seletor de contexto** (opção 1, confirmada pelo usuário — descartada a opção 2 de seletor pós-login).
- O sistema **já é construído em cima desse modelo** (`AreaRoute` + `user.areasPermitidas`, ver `src/components/AreaRoute.tsx` e `src/config/areas.ts`). Falta apenas **limitar no admin o máximo de 2 áreas por colaborador** — hoje a tela de Usuários permite liberar as 3 sem restrição.

---

## 5. Ordem de execução — micro-tarefas

Cada item abaixo é uma unidade de trabalho independente, testável isoladamente, na ordem recomendada (bugs primeiro, depois performance, depois reestruturação — do menor risco pro maior).

### Bloco A — Correção crítica (baixo risco, alto impacto) — ✅ aplicado
- [x] **A1.** Ajustado `authService.ts`: erro `email_not_confirmed` diferenciado do genérico "Email ou senha incorretos", com mensagem específica.
- [x] **A2.** Testado os 3 cenários de login: aprovado + e-mail confirmado, aprovado + e-mail não confirmado, pendente/rejeitado.

### Bloco B — Performance (login e Kanban) — ✅ aplicado
- [x] **B1.** `getAlunos()` (`alunosService.ts`) agora busca em **lotes de 500** via `.range()`, em vez de uma query única sem limite.
- [x] **B2.** *(ajustado em relação ao plano original — ver nota abaixo)* `AlunosProvider` prioriza a área da rota atual (`/alunos` → rematrícula, `/retencao`, `/engajamento`) e libera a tela assim que o **primeiro lote** dessa área chega; o restante (outras áreas) continua carregando por trás, sem bloquear.
- [x] **B3.** `KanbanColumn` e `AlunoCard` memoizados com `React.memo`; `KanbanBoard` agora agrupa os alunos por status com `useMemo`, garantindo referência de array estável por coluna (sem isso o `React.memo` não tinha efeito nenhum). O `value` do `AlunosContext` e suas funções (`addAluno`, `updateAluno`, etc.) também foram memoizados com `useMemo`/`useCallback`, para telas que não usam `alunos` diretamente (Layout, MinhaArea, Dashboard) pararem de re-renderizar por tabela cheia.
- [ ] **B4.** Medir re-render com React DevTools Profiler antes/depois, com uma massa de dados simulada — segue pendente, precisa de uma base com volume real (ver seção 6). `tsc --noEmit`, `eslint` e `vite build` foram rodados e passaram limpos após as mudanças.

**Nota sobre B2:** o plano original previa carregar *só* a área ativa e nada mais. Isso quebraria Retenção, Engajamento, Grupos, Risco de Evasão, Dashboard e Colaboradores, que hoje leem a lista completa de alunos (`alunos` do contexto) misturando as 3 áreas — são cerca de 6 telas com esse acoplamento. Implementei a versão que resolve o mesmo sintoma (login/abertura lenta) sem quebrar essas telas: a área ativa chega primeiro e libera a UI, o resto carrega em segundo plano. Separar de verdade por área (cada tela buscando só o que precisa) é um refactor maior, de escopo de várias telas — registrado como próximo passo, não escondido como já resolvido.

**Limitação conhecida que continua:** como `AlunoCard` e `KanbanBoard` consomem o contexto inteiro (`useAlunos()`), eles ainda re-renderizam sempre que **qualquer** aluno da lista muda (o array `alunos`/`filteredAlunos` muda de referência nesse caso) — o `React.memo` evita renders por causas *fora* dessa mudança, mas não isola um card específico de uma alteração em outro card. Resolver isso por completo exigiria separar o estado por aluno (ex: cache tipo React Query) — fora do escopo deste bloco.

### Bloco C — Acesso e permissões — ✅ aplicado
- [x] **C1.** Limitado no admin (tela Usuários, `src/pages/Usuarios.tsx`) o máximo de **2 áreas simultâneas** por colaborador: `aprovar()` e `reativar()` não concedem mais as 3 áreas por padrão, e `toggleArea()` bloqueia (com toast explicando o motivo) a tentativa de marcar uma 3ª área, desabilitando visualmente os checkboxes não marcados quando o limite já foi atingido.
- [x] **C1 (reforço no banco).** Adicionada `database/008_limite_areas_por_colaborador.sql`: uma `CHECK constraint` em `profiles.areas_permitidas` garantindo o limite de 2 no próprio schema — a validação da UI sozinha não impede um UPDATE direto via API/Supabase com 3 áreas. A migration também corrige dados existentes (a migration 007 havia concedido as 3 áreas de uma vez pra quem já usava o sistema) antes de criar a constraint, senão ela não sobe.
- [x] **C2.** Validado: `AreaRoute` (`src/components/AreaRoute.tsx`) e o menu (`Layout.tsx`) já checam acesso com `.includes(area)`, sem nenhuma suposição de quantidade fixa — funcionam corretamente com 1 ou 2 áreas sem precisar de nenhum ajuste.

**Ação pendente do seu lado:** rodar a migration `008_limite_areas_por_colaborador.sql` no SQL Editor do Supabase. Depois de rodar, vale conferir na tela de Usuários quem foi cortado de 3 para 2 áreas automaticamente pela migration (ela corta sem critério de prioridade — pega as 2 primeiras do array salvo).

### Bloco D — Reestruturação de navegação
- [ ] **D1.** Criar página "Funil de Rematrícula" com sistema de abas, reaproveitando os componentes existentes de Início, Alunos e Risco de Evasão sem alterar sua lógica interna.
- [ ] **D2.** Mover Métricas para dentro das abas, preparando a estrutura para os 3 processos (rematrícula ativo, retenção/engajamento com encaixe pronto e vazio/placeholder).
- [ ] **D3.** Adicionar filtro por funil (rematrícula/retenção/engajamento) em Grupos, ao lado dos filtros de status e etiqueta já existentes.
- [ ] **D4.** Restringir abas Colaboradores e Usuários para admin dentro da nova estrutura de abas (reaproveitando `AdminRoute`/checagem de `role`).
- [ ] **D5.** Atualizar `App.tsx` (rotas) e `Layout.tsx` (menu) para refletir a nova estrutura consolidada.
- [ ] **D6.** Teste de regressão manual: navegação completa como admin e como colaborador com 1 e com 2 áreas.

---

## 6. Limitação conhecida da auditoria de performance

Os pontos B1–B4 foram diagnosticados **pelo padrão do código**, não por um teste de carga real: o ambiente de diagnóstico não tem uma base de dados populada em volume de produção. O comportamento é o perfil clássico de "funciona liso com poucos dados de teste, engasga com milhares de registros e histórico longo" — mas a confirmação definitiva (e a medição de ganho após a correção) exige rodar contra uma base com volume real ou uma massa de dados simulada equivalente.

---

## 7. Arquivos envolvidos por bloco

| Bloco | Arquivos |
|---|---|
| A (login) | `src/services/authService.ts` |
| B (performance) | `src/services/alunosService.ts`, `src/contexts/AlunosContext.tsx`, `src/components/kanban/KanbanColumn.tsx`, `src/components/kanban/AlunoCard.tsx` |
| C (acessos) | `src/pages/Usuarios.tsx`, `src/components/AreaRoute.tsx` (validação, sem mudança estrutural) |
| D (abas) | `src/App.tsx`, `src/components/Layout.tsx`, `src/pages/Grupos.tsx`, `src/pages/MetricasDashboard.tsx`, novo componente de página com abas |

---

## 8. Status

- **Bloco A (fix do login) — aplicado** (feito diretamente pelo usuário).
- **Bloco B (performance) — aplicado.** Ver detalhes e nota sobre o ajuste de escopo do B2 acima.
- **Bloco C (limite de 2 áreas) — aplicado.** Falta rodar a migration `008` no Supabase (ver nota acima).
- **Bloco D (abas)** — ainda não aplicado.

Próximo passo sugerido: **Bloco D** (reestruturação em abas — "Funil de Rematrícula"), o maior e mais arriscado dos quatro; recomendo revisar o plano da seção 4 antes de eu começar a mexer em `App.tsx`/`Layout.tsx`.
