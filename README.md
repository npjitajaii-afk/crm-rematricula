# CRM Rematrícula

Sistema para acompanhamento do funil de rematrícula de alunos, com pipeline estilo Kanban. React + TypeScript + Supabase.

## 🚀 Funcionalidades

- ✅ Autenticação real via Supabase Auth
- ✅ Pipeline Kanban com 7 etapas de rematrícula
- ✅ Cadastro e edição de alunos (RA, curso, turno, débito pendente)
- ✅ Importação/exportação em planilha (CSV/XLSX)
- ✅ Filtros por status, canal de contato e período
- ✅ Histórico completo de interações por aluno
- ✅ Interface responsiva

## 🛠️ Tecnologias

- React 18 + TypeScript + Vite
- Supabase (PostgreSQL + Auth + RLS)
- React Router
- Lucide Icons

## 📋 Pré-requisitos

- Node.js 18+
- Conta no Supabase (gratuita)
- Conta na Vercel (gratuita)

## 🔧 Instalação Local

1. Instale as dependências:

```bash
npm install
```

2. Configure as variáveis de ambiente (copie `.env.example` para `.env`):

```bash
VITE_SUPABASE_URL=sua_url_do_supabase
VITE_SUPABASE_ANON_KEY=sua_chave_anonima
```

3. Execute o schema do banco no Supabase:

   - Acesse seu projeto no Supabase → **SQL Editor**
   - Cole e execute o conteúdo de `database/schema.sql`

4. No Supabase, em **Authentication → Providers**, garanta que o login por Email/Senha está habilitado. Se quiser evitar problemas com confirmação de e-mail em ambiente de teste, você pode desativar "Confirm email" em **Authentication → Settings**.

5. Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

## 🚀 Deploy (Vercel)

Este projeto é pensado para deploy **apenas na Vercel** — sem VPS, sem configuração de servidor.

1. Suba o projeto para um repositório no GitHub.
2. Acesse [vercel.com](https://vercel.com) → **Add New → Project** → importe o repositório.
3. A Vercel detecta automaticamente que é um projeto Vite:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Clique em **Deploy**. Pronto — o app fica em `https://seu-app.vercel.app`.

O arquivo `vercel.json` já está configurado com o rewrite necessário para o React Router funcionar em qualquer rota (sem erro 404 ao atualizar a página).

### Após o primeiro deploy

No Supabase, em **Authentication → URL Configuration**, adicione a URL da Vercel (`https://seu-app.vercel.app`) tanto no **Site URL** quanto em **Redirect URLs**, para o fluxo de autenticação funcionar corretamente em produção.

## 🔒 Sobre o banco de dados

O schema já vem com Row Level Security (RLS) habilitado: qualquer usuário autenticado (colaborador da instituição) pode ver e gerenciar todos os alunos — não é um sistema multi-tenant por usuário. Se no futuro você quiser restringir por responsável, ajuste as policies em `database/schema.sql`.

## 🆘 Troubleshooting

**Erro 404 ao navegar/atualizar a página em produção:**
- Confirme que `vercel.json` está na raiz do projeto (o rewrite para `index.html` já resolve isso).

**Erro de login/registro:**
- Verifique se o schema foi executado (tabela `profiles` e trigger `on_auth_user_created` precisam existir).
- Confira se `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` estão corretos no ambiente da Vercel.

**"Verifique seu e-mail" ao registrar:**
- Isso significa que a confirmação de e-mail está ativada no Supabase. Desative em **Authentication → Settings** se quiser login imediato após o cadastro, ou configure um provedor de SMTP para o envio de e-mails funcionar de forma confiável (o SMTP padrão do Supabase tem limite de envio baixo).

## 📝 Licença

MIT
