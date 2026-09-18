# Mudança: Supervisores vinculados a um setor

## O que muda

Antes o **supervisor** gerenciava o **polo inteiro** (todos os setores do Engajamento):
- Via qualquer contato do polo
- Delegava/reatribuía para qualquer colaborador do polo
- Aprovava transferências de qualquer setor do polo

Agora o **supervisor precisa de um setor** e só tem esses poderes **dentro do seu setor**:
- Vê / edita / exclui / delega apenas contatos do seu setor (Engajamento)
- Só pode delegar para colaboradores do mesmo setor
- Só aprova/recusa transferências em que a origem **ou** o destino é o seu setor
- Nas outras áreas (rematrícula, retenção etc.) continua com visão de polo

O **admin** continua com acesso total em todos os polos/setores.

## Arquivos alterados

1. `database/048_supervisor_por_setor.sql` — **rode este script no SQL Editor do Supabase**
2. `src/pages/Usuarios.tsx` — permite definir setor para supervisor e exige setor ao promover
3. `src/components/DelegarContatoModal.tsx` — lista só colaboradores do setor do supervisor
4. `src/types/index.ts` — comentários atualizados

## Passos para aplicar

1. Rode a migration `048_supervisor_por_setor.sql` no Supabase.
2. Substitua os arquivos de frontend listados acima (ou faça merge).
3. **Atribua setor aos supervisores existentes** (obrigatório):

```sql
-- Liste supervisores sem setor:
SELECT id, name, email, polo_id, setor_id
FROM public.profiles
WHERE role = 'supervisor' AND setor_id IS NULL;

-- Atribua o setor (substitua os UUIDs):
UPDATE public.profiles
SET setor_id = '<uuid-do-setor>'
WHERE id = '<uuid-do-supervisor>';
```

Sem `setor_id`, o supervisor **não** conseguirá ver contatos de Engajamento nem decidir transferências.

4. Rebuild/redeploy do frontend.

## Testes sugeridos

- Login como supervisor com setor X:
  - Só vê contatos de engajamento do setor X
  - Ao delegar, só aparece colaboradores do setor X
  - Na tela de Transferências, só consegue aprovar as que envolvem o setor X
- Admin continua vendo e aprovando tudo
- Colaborador sem mudança de comportamento
