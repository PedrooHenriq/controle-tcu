# 🚀 DEPLOY_INSTRUCTIONS.md
## Controle de Estudos — Guia de Implantação e Recursos da Versão 2.0

---

## 📁 Arquivos do Projeto

| Arquivo | Finalidade |
|---|---|
| `Controle_TCU.html` | Aplicação SPA React 18 completa (Ciclo, Edital, CSV, Stories, Modais, Sync) |
| `.gitignore` | Arquivos ignorados pelo Git |
| `netlify.toml` | Configuração de headers e publicação estática no Netlify |
| `.env.example` | Variáveis de ambiente de exemplo |
| `supabase_setup.sql` | Script SQL completo: `user_state`, `study_activities`, `state_backups`, RLS e rotinas de expurgo |
| `supabase/functions/weekly-report/` | Supabase Edge Function para envio do resumo semanal por e-mail |
| `DEPLOY_INSTRUCTIONS.md` | Este guia de implantação e operação |

---

## 🌟 Novas Funcionalidades Implementadas (V2.0)

1. **Ciclo de Estudos Dinâmico & Reativo:**
   - Vinculação com cálculo funcional derivado: ao excluir ou editar qualquer atividade de estudo, o tempo é imediatamente estornado das metas do ciclo, sem reter minutos indevidamente.
2. **Importação de Atividades via .CSV:**
   - Botão **"📤 Importar .csv"** na tabela de atividades.
   - Suporte a separadores `;` e `,`, detecção automática de datas (`DD/MM/AAAA` e `AAAA-MM-DD`), durações formatadas (`1h 30m`, `90 min`) ou numéricas.
   - Criação automática de disciplinas não cadastradas com geração de siglas e cores da paleta.
   - Botão para baixar modelo oficial `.csv`.
3. **Gerador de Stories 9:16 para Redes Sociais:**
   - Motor baseado em `html2canvas` com fallback para `html-to-image`, gerando imagem nativa de alta resolução (1080x1920 px).
   - Renderização off-screen estável com suporte completo a gráficos Chart.js, gradientes e fontes web.
   - Feedback de carregamento (*"Gerando..."*) e compartilhamento nativo em smartphones via Web Share API.
4. **Relatório Semanal de Estudos (Sábado às 23:59):**
   - Período fixo Domingo a Sábado comparado com a semana anterior.
   - Indicadores:
     - Total de horas estudadas + Variação percentual em relação à semana anterior.
     - Total de questões e % de aproveitamento geral + Variações percentuais.
     - Tabela por matéria: questões feitas, acertos, % de aproveitamento e variações individuais.
     - Quadro de rastreamento diário (horas líquidas por dia da semana).
     - Gráfico de tipos de estudo (Leitura, Exercício, Flashcards, Videoaula, Revisão, Outro).
   - Modal no app com visualização em tempo real e botão para disparo de e-mail de teste.
   - Edge Function do Supabase pronta para integração com Resend / SendGrid via `pg_cron`.
5. **Gerenciamento de Matérias com Preservação Histórica:**
   - Capacidade de excluir qualquer disciplina (nativa do edital ou criada pelo usuário).
   - O histórico de atividades, gráficos e horas acumuladas no banco de dados permanece 100% intacto.
   - Aba "Excluídas" dentro de *Gerenciar Matérias & Cores* permitindo restaurar matérias a qualquer momento.
6. **Concurso e Foco Editáveis:**
   - Botão **"✏️ Alterar Concurso"** no cabeçalho.
   - Permite personalizar o concurso (ex: "Tribunal de Contas da União", "Receita Federal", "Polícia Federal") e o cargo/título (ex: "Controle de Estudos", "Auditor-Fiscal").
   - O nome do concurso é sincronizado na nuvem e aplicado dinamicamente no cabeçalho, no resumo semanal e nos stories.
7. **Sincronização Multi-Dispositivo Confiável & Backups por Aparelho:**
   - Ao fazer login em um novo aparelho, o app baixa prioritariamente os dados da nuvem com trava de segurança contra sobreposição acidental por `localStorage` vazio.
   - Auto-sincronização automática a cada 5 minutos no servidor.
   - Snapshots de backup salvos na tabela `state_backups` por aparelho conectado e retidos por pelo menos 3 dias.

---

## 🗄️ Atualização do Banco de Dados no Supabase

Se você já executou a versão anterior do script SQL, execute apenas o trecho da tabela de backups:

1. Acesse o painel do Supabase: [https://app.supabase.com](https://app.supabase.com)
2. Acesse **SQL Editor** → **New query**.
3. Execute o script abaixo:

```sql
-- Criação da tabela de backups por aparelho
CREATE TABLE IF NOT EXISTS public.state_backups (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id    TEXT,
  device_label TEXT,
  reason       TEXT        DEFAULT 'automatico',
  payload      JSONB       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS state_backups_user_idx
  ON public.state_backups(user_id, created_at DESC);

-- Função de expurgo (limpa backups mais antigos que 3 dias)
CREATE OR REPLACE FUNCTION public.clean_old_backups()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.state_backups WHERE created_at < NOW() - INTERVAL '3 days';
END;
$$;

-- RLS
ALTER TABLE public.state_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "state_backups_select_own"
  ON public.state_backups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "state_backups_insert_own"
  ON public.state_backups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "state_backups_delete_own"
  ON public.state_backups FOR DELETE
  USING (auth.uid() = user_id);
```

---

## ✉️ Configuração da Edge Function de E-mail Semanal

A Edge Function está em `supabase/functions/weekly-report/index.ts`.

### 1. Deploy da Edge Function (via Supabase CLI)
```powershell
# Efetue login no Supabase CLI
npx supabase login

# Faça o deploy da função no projeto
npx supabase functions deploy weekly-report --project-ref ntmuaxqeedtzlznzjkxr
```

### 2. Configurar Chave da Resend (Serviço de envio de e-mails)
1. Crie uma conta gratuita em [https://resend.com](https://resend.com) e gere uma API Key.
2. No painel do Supabase, vá em **Project Settings** → **Edge Functions** → **Secrets**.
3. Adicione o secret:
   - `RESEND_API_KEY`: `re_xxxxxxxxxxxxxxxx`

### 3. Agendamento Automático aos Sábados 23:59 (pg_cron)
No **SQL Editor** do Supabase, ative as extensões `pg_cron` e `pg_net` em **Database** → **Extensions**, e execute:

```sql
-- 23:59 de Sábado em Brasília (UTC-3) corresponde a 02:59 UTC de Domingo
SELECT cron.schedule(
  'weekly-study-report',
  '59 2 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://ntmuaxqeedtzlznzjkxr.supabase.co/functions/v1/weekly-report',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_hGsz9_csLIR6AxTgogTZ6A_AwmoCtAf"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Limpeza diária de backups antigos (> 3 dias)
SELECT cron.schedule('clean-old-backups-daily', '0 3 * * *', 'SELECT public.clean_old_backups();');
```

---

## 🚀 Publicar as Atualizações no Netlify via Git

Para enviar todas as atualizações para o repositório remoto e disparar a atualização automática no Netlify:

```powershell
cd c:\Controle_Estudos
git status
git add .
git commit -m "feat: ciclo reativo, importacao csv, stories 9:16, relatorio semanal, exclusao de materias e sync v2"
git push origin master
```

Em ~30 segundos o Netlify compila e publica a nova versão em produção!
