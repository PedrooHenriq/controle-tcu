# 🚀 DEPLOY_INSTRUCTIONS.md
## Controle TCU · AFCE — Guia Completo de Implantação

---

## 📁 Arquivos Gerados Nesta Sessão

| Arquivo | Finalidade |
|---|---|
| `Controle_TCU.html` | App principal (modificado com integração Supabase) |
| `.gitignore` | Garante que `.env`, `node_modules` etc. não entrem no Git |
| `netlify.toml` | Configuração do Netlify (sem build step, headers de segurança) |
| `.env.example` | Template de variáveis de ambiente (sem chaves reais) |
| `supabase_setup.sql` | Script SQL completo com tabelas + RLS para o Supabase |
| `DEPLOY_INSTRUCTIONS.md` | Este arquivo |

---

## ETAPA A — Configurar o Supabase (Banco de Dados em Nuvem)

### 1. Criar o Projeto Supabase

1. Acesse [https://app.supabase.com](https://app.supabase.com) e faça login (ou crie uma conta gratuita).
2. Clique em **"New project"**.
3. Preencha:
   - **Name:** `controle-tcu` (ou o nome que preferir)
   - **Database Password:** crie uma senha forte e guarde-a
   - **Region:** escolha `South America (São Paulo)` para menor latência
4. Aguarde ~2 minutos enquanto o projeto é provisionado.

### 2. Executar o Script SQL (Criar Tabelas + RLS)

1. No painel do Supabase, vá em **SQL Editor** → **New query**.
2. Copie todo o conteúdo do arquivo [`supabase_setup.sql`](./supabase_setup.sql).
3. Cole no editor e clique em **Run** (ou `Ctrl+Enter`).
4. Você deve ver: `Success. No rows returned.`

> **O que o script cria:**
> - Tabela `user_state` — armazena o estado completo de cada usuário (1 linha por usuário, upsert automático)
> - Tabela `study_activities` — armazena cada sessão de estudo individualmente
> - **RLS ativado em ambas** — cada usuário lê/escreve APENAS seus próprios dados
> - Trigger `updated_at` automático

### 3. Obter as Chaves da API

1. No painel do Supabase, vá em **Settings** → **API**.
2. Copie dois valores:
   - **Project URL** → ex: `https://abcdefghijklm.supabase.co`
   - **anon public** (em "Project API Keys") → ex: `eyJhbGciOiJIUzI1NiIs...`

> ⚠️ **NUNCA use a `service_role` key no front-end.** Use apenas a `anon` key.

### 4. Colar as Chaves no HTML

Abra `Controle_TCU.html` e localize (aproximadamente linha 245):

```javascript
const SUPABASE_URL      = 'https://SEU_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.SUA_ANON_KEY_AQUI';
```

Substitua pelos valores copiados:

```javascript
const SUPABASE_URL      = 'https://abcdefghijklm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOi...';
```

Salve o arquivo.

---

## ETAPA B — Instalar Git e Publicar no GitHub

### 1. Instalar o Git (se ainda não tiver)

Baixe e instale: [https://git-scm.com/download/win](https://git-scm.com/download/win)

Após instalar, abra um novo terminal PowerShell e confirme:
```powershell
git --version
```

### 2. Inicializar o Repositório Local

```powershell
cd c:\Controle_Estudos
git init
git add .
git commit -m "feat: initial commit — TCU AFCE com integração Supabase"
```

### 3. Criar e Vincular ao Repositório Remoto no GitHub

**Opção A — Via GitHub CLI (recomendado):**
```powershell
# Instale o GitHub CLI: https://cli.github.com/
gh auth login
gh repo create controle-tcu --public --source=. --remote=origin --push
```

**Opção B — Via GitHub Web:**
1. Acesse [https://github.com/new](https://github.com/new) e crie o repositório (ex: `controle-tcu`)
2. Execute no terminal:
```powershell
git remote add origin https://github.com/SEU_USUARIO/controle-tcu.git
git branch -M main
git push -u origin main
```

---

## ETAPA C — Publicar no Netlify (HTTPS + CI/CD Automático)

### Opção 1 — Deploy via GitHub (CI/CD automático — Recomendado)

1. Acesse [https://app.netlify.com](https://app.netlify.com) e faça login.
2. Clique em **"Add new site"** → **"Import an existing project"**.
3. Escolha **GitHub** e autorize o acesso.
4. Selecione o repositório `controle-tcu`.
5. Em **Build settings**:
   - **Build command:** (deixe em branco — sem build)
   - **Publish directory:** `.` (ponto — raiz do repositório)
6. Clique em **"Deploy site"**.

A partir desse momento, **qualquer `git push` para `main` dispara um novo deploy automaticamente**.

### Opção 2 — Deploy via Drag & Drop (mais rápido para teste)

1. Acesse [https://app.netlify.com/drop](https://app.netlify.com/drop).
2. Arraste a pasta `c:\Controle_Estudos` para a área indicada.
3. O Netlify gera automaticamente uma URL pública com HTTPS.

> ⚠️ O drag & drop não tem CI/CD automático. Para atualizações, repita o processo ou migre para a opção via GitHub.

---

## ETAPA D — Configurar Variáveis de Ambiente no Netlify (Opcional)

Atualmente as chaves do Supabase estão **hardcoded no HTML** (o que é aceitável para `anon key` pública). Mas se preferir gerenciá-las via variáveis de ambiente:

1. No painel do Netlify: **Site settings** → **Environment variables** → **Add variable**.
2. Adicione:
   - `SUPABASE_URL` = `https://SEU_PROJECT_REF.supabase.co`
   - `SUPABASE_ANON_KEY` = `eyJ...`
3. Para usá-las no HTML estático, você precisaria de um build step (ex: substituição de texto via script). Para este projeto estático, as chaves no HTML são a abordagem mais simples.

---

## 🌐 Acessando a Aplicação

Após o deploy, o Netlify gera uma URL no formato:
```
https://nome-aleatorio-123.netlify.app
```

Você pode customizar o subdomínio em **Site settings** → **Domain management** → **Custom domains**.

---

## 🔐 Como Funciona a Autenticação e o Sync

| Situação | Comportamento |
|---|---|
| **Supabase NÃO configurado** | App funciona 100% offline com localStorage |
| **Configurado + Deslogado** | Dados salvos apenas localmente (fallback) |
| **Configurado + Logado** | Dados salvos no localStorage E na nuvem (dupla persistência) |
| **Novo login em outro dispositivo** | Estado da nuvem é carregado e mesclado com o local |

### Fluxo de Autenticação

1. Clique em **"Login / Cadastro"** no cabeçalho do app.
2. Na primeira vez, escolha **"Cadastro"** → insira e-mail e senha → confirme o e-mail recebido.
3. Após confirmar, clique em **"Login"** → seus dados serão sincronizados automaticamente.
4. O indicador **"☁ Sincronizado"** aparece no cabeçalho quando o save foi bem-sucedido.

---

## 🗄️ Estrutura do Banco de Dados Supabase

### Tabela `user_state`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Chave primária |
| `user_id` | UUID | Referência para `auth.users` |
| `payload` | JSONB | Estado completo do app (tópicos, atividades, ciclo, etc.) |
| `updated_at` | TIMESTAMPTZ | Atualizado automaticamente via trigger |

**Estratégia:** 1 linha por usuário com `UPSERT`. Simples, eficiente, sem conflitos.

### Tabela `study_activities`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | TEXT | ID único da atividade (`act_timestamp_random`) |
| `user_id` | UUID | Dono da atividade (RLS) |
| `discipline_id` | TEXT | Sigla da disciplina |
| `tipo` | TEXT | Leitura, Exercício, Revisão... |
| `date` | DATE | Data da sessão |
| `seconds` | INTEGER | Duração em segundos |
| `feitas` / `acertos` | INTEGER | Questões feitas e acertos |

> **RLS ativo:** cada usuário acessa SOMENTE seus próprios registros em ambas as tabelas.

---

## 🔄 Atualizações Futuras

Para atualizar a aplicação após o deploy inicial (com CI/CD via GitHub):

```powershell
cd c:\Controle_Estudos
git add .
git commit -m "fix: descrição da alteração"
git push
```

O Netlify detecta o push automaticamente e republicaa em ~30 segundos.

---

*Gerado automaticamente em 2026-09-24 | Plataformas: Netlify (Free) + Supabase (Free)*
