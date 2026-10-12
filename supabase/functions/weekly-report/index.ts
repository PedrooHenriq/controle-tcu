// supabase/functions/weekly-report/index.ts
// Supabase Edge Function: Disparo de relatório semanal aos sábados 23:59
// Compatível com Deno / Supabase Edge Runtime

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Activity {
  id: string;
  date: string;
  disciplineId: string;
  tipo?: string;
  seconds?: number;
  feitas?: number;
  acertos?: number;
}

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min`;
  return `${s}s`;
}

function formatBR(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function getSundaySaturdayRange(refDateStr?: string) {
  const d = refDateStr ? new Date(refDateStr + "T00:00:00") : new Date();
  const dayOfWeek = d.getDay();
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - dayOfWeek);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);

  const prevSunday = new Date(sunday);
  prevSunday.setDate(sunday.getDate() - 7);
  const prevSaturday = new Date(sunday);
  prevSaturday.setDate(sunday.getDate() - 1);

  const toStr = (dt: Date) => dt.toISOString().split("T")[0];
  return {
    curStart: toStr(sunday),
    curEnd: toStr(saturday),
    prevStart: toStr(prevSunday),
    prevEnd: toStr(prevSaturday),
  };
}

function generateReportHtml(
  userEmail: string,
  state: any,
  range: { curStart: string; curEnd: string; prevStart: string; prevEnd: string }
): string {
  const acts: Activity[] = Array.isArray(state?.activities) ? state.activities : [];
  const disciplines: Array<{ id: string; name: string; sigla: string; color: string }> =
    state?._meta?.disciplines || [];
  const contestName = state?.settings?.targetExam || state?._meta?.contestName || "Controle de Estudos";
  const roleName = state?.settings?.targetRole || "Ciclo & Edital";

  const curActs = acts.filter((a) => a.date >= range.curStart && a.date <= range.curEnd);
  const prevActs = acts.filter((a) => a.date >= range.prevStart && a.date <= range.prevEnd);

  const sumSec = (list: Activity[]) => list.reduce((a, s) => a + (Number(s.seconds) || 0), 0);
  const sumFeitas = (list: Activity[]) => list.reduce((a, s) => a + (Number(s.feitas) || 0), 0);
  const sumAcertos = (list: Activity[]) => list.reduce((a, s) => a + (Number(s.acertos) || 0), 0);

  const curSec = sumSec(curActs);
  const prevSec = sumSec(prevActs);
  const hoursVar = prevSec > 0 ? ((curSec - prevSec) / prevSec) * 100 : curSec > 0 ? 100 : 0;

  const curFeitas = sumFeitas(curActs);
  const prevFeitas = sumFeitas(prevActs);
  const curAcertos = sumAcertos(curActs);
  const prevAcertos = sumAcertos(prevActs);

  const curPct = curFeitas > 0 ? (curAcertos / curFeitas) * 100 : 0;
  const prevPct = prevFeitas > 0 ? (prevAcertos / prevFeitas) * 100 : 0;
  const questVar = prevFeitas > 0 ? ((curFeitas - prevFeitas) / prevFeitas) * 100 : curFeitas > 0 ? 100 : 0;
  const pctVar = curPct - prevPct;

  // Dias da semana
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const daysRows = [];
  const maxSec = Math.max(...dayNames.map((_, i) => sumSec(curActs.filter(a => a.date === addDays(range.curStart, i)))), 3600);

  for (let i = 0; i < 7; i++) {
    const dStr = addDays(range.curStart, i);
    const dayActs = curActs.filter((a) => a.date === dStr);
    const sec = sumSec(dayActs);
    const feitas = sumFeitas(dayActs);
    const acertos = sumAcertos(dayActs);
    const pctBar = Math.min(100, Math.round((sec / maxSec) * 100));
    daysRows.push({
      name: dayNames[i],
      dateShort: formatBR(dStr).slice(0, 5),
      sec,
      feitas,
      acertos,
      pctBar,
    });
  }

  // Tipos de estudo
  const byTipo: Record<string, number> = {};
  curActs.forEach((a) => {
    const t = a.tipo || "Outro";
    byTipo[t] = (byTipo[t] || 0) + (Number(a.seconds) || 0);
  });
  const tipos = Object.entries(byTipo)
    .map(([tipo, sec]) => ({
      tipo,
      sec,
      pct: curSec > 0 ? (sec / curSec) * 100 : 0,
    }))
    .sort((a, b) => b.sec - a.sec);

  // Matérias
  const discIds = Array.from(new Set([...curActs.map((a) => a.disciplineId), ...prevActs.map((a) => a.disciplineId)]));
  const materias = discIds.map((id) => {
    const disc = disciplines.find((d) => d.id === id);
    const cActs = curActs.filter((a) => a.disciplineId === id);
    const pActs = prevActs.filter((a) => a.disciplineId === id);

    const cFeitas = sumFeitas(cActs);
    const cAcertos = sumAcertos(cActs);
    const cPct = cFeitas > 0 ? (cAcertos / cFeitas) * 100 : 0;

    const pFeitas = sumFeitas(pActs);
    const pAcertos = sumAcertos(pActs);
    const pPct = pFeitas > 0 ? (pAcertos / pFeitas) * 100 : 0;

    const mQuestVar = pFeitas > 0 ? ((cFeitas - pFeitas) / pFeitas) * 100 : cFeitas > 0 ? 100 : 0;
    const mPctVar = cPct - pPct;

    return {
      name: disc ? disc.name : id,
      sigla: disc ? disc.sigla : id.toUpperCase().slice(0, 4),
      color: disc ? disc.color : "#ad8a4e",
      sec: sumSec(cActs),
      cFeitas,
      cAcertos,
      cPct,
      mQuestVar,
      mPctVar,
    };
  }).filter((m) => m.sec > 0 || m.cFeitas > 0);

  const fmtVarBadge = (v: number, isPP = false) => {
    if (v === 0) return `<span style="color:#8398b8;font-family:monospace;">0${isPP ? " p.p." : "%"}</span>`;
    const pos = v > 0;
    const color = pos ? "#2F7D53" : "#AE4436";
    const sign = pos ? "+" : "";
    return `<span style="color:${color};font-weight:bold;font-family:monospace;">${sign}${v.toFixed(1).replace(".", ",")}${isPP ? " p.p." : "%"}</span>`;
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Resumo Semanal de Estudos</title>
</head>
<body style="margin:0;padding:24px;background-color:#F7F3EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#132038;">
  <div style="max-width:640px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(19,32,56,0.08);border:1px solid #E6D9BE;">
    
    <!-- Cabeçalho -->
    <div style="background:#132038;padding:28px 24px;color:#F7F3EA;text-align:center;">
      <span style="display:inline-block;padding:4px 12px;background:rgba(173,138,78,0.25);border:1px solid #AD8A4E;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:1px;color:#D8B266;text-transform:uppercase;margin-bottom:8px;">
        ${contestName}
      </span>
      <h1 style="margin:0;font-size:24px;font-weight:700;color:#FFFFFF;letter-spacing:-0.5px;">
        Resumo Semanal de Estudos
      </h1>
      <p style="margin:6px 0 0 0;font-size:13px;color:#AEBDD4;">
        Período: <strong>${formatBR(range.curStart)}</strong> a <strong>${formatBR(range.curEnd)}</strong> (Dom a Sáb)
      </p>
    </div>

    <!-- Conteúdo Principal -->
    <div style="padding:24px;">

      <!-- Cartões de Destaque -->
      <table style="width:100%;border-collapse:separate;border-spacing:8px;margin-bottom:16px;">
        <tr>
          <td style="background:#FAF8F3;border:1px solid #E6D9BE;border-radius:12px;padding:14px;text-align:center;width:50%;">
            <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#5A729C;font-weight:700;display:block;">Horas Líquidas</span>
            <div style="font-size:26px;font-weight:800;color:#132038;margin:4px 0;">${formatDuration(curSec)}</div>
            <div style="font-size:11px;color:#5A729C;">vs sem. ant.: ${fmtVarBadge(hoursVar)}</div>
          </td>
          <td style="background:#FAF8F3;border:1px solid #E6D9BE;border-radius:12px;padding:14px;text-align:center;width:50%;">
            <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#5A729C;font-weight:700;display:block;">Questões Feitas</span>
            <div style="font-size:26px;font-weight:800;color:#132038;margin:4px 0;">${curFeitas}</div>
            <div style="font-size:11px;color:#5A729C;">vs sem. ant.: ${fmtVarBadge(questVar)}</div>
          </td>
        </tr>
        <tr>
          <td style="background:#FAF8F3;border:1px solid #E6D9BE;border-radius:12px;padding:14px;text-align:center;width:50%;">
            <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#5A729C;font-weight:700;display:block;">Aproveitamento Geral</span>
            <div style="font-size:26px;font-weight:800;color:#132038;margin:4px 0;">${curFeitas > 0 ? curPct.toFixed(1).replace(".", ",") + "%" : "—"}</div>
            <div style="font-size:11px;color:#5A729C;">vs sem. ant.: ${fmtVarBadge(pctVar, true)}</div>
          </td>
          <td style="background:#FAF8F3;border:1px solid #E6D9BE;border-radius:12px;padding:14px;text-align:center;width:50%;">
            <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#5A729C;font-weight:700;display:block;">Acertos / Erros</span>
            <div style="font-size:26px;font-weight:800;color:#2F7D53;margin:4px 0;">${curAcertos} acertos</div>
            <div style="font-size:11px;color:#AE4436;">${curFeitas > 0 ? curFeitas - curAcertos : 0} erros</div>
          </td>
        </tr>
      </table>

      <!-- Quadro de Rastreamento Diário -->
      <div style="background:#FAF8F3;border:1px solid #E6D9BE;border-radius:12px;padding:16px;margin-bottom:20px;">
        <h3 style="margin:0 0 12px 0;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#132038;font-weight:700;">
          📅 Rastreamento Diário da Semana
        </h3>
        <table style="width:100%;border-collapse:collapse;text-align:center;font-size:11px;">
          <tr>
            ${daysRows.map((d) => `
              <td style="padding:4px 2px;">
                <div style="font-weight:700;color:#5A729C;">${d.name}</div>
                <div style="color:#8398B8;font-size:10px;margin-bottom:6px;">${d.dateShort}</div>
                <div style="height:60px;background:#E6D9BE;border-radius:4px;display:flex;align-items:flex-end;overflow:hidden;margin:0 auto;width:24px;">
                  <div style="width:100%;height:${d.pctBar}%;background:#AD8A4E;border-radius:2px;"></div>
                </div>
                <div style="font-weight:700;color:#132038;margin-top:6px;font-size:10px;">${d.sec > 0 ? formatDuration(d.sec) : "—"}</div>
                <div style="color:#5A729C;font-size:9px;">${d.feitas > 0 ? `${d.acertos}/${d.feitas}` : ""}</div>
              </td>
            `).join("")}
          </tr>
        </table>
      </div>

      <!-- Tipos de Estudo -->
      <div style="background:#FAF8F3;border:1px solid #E6D9BE;border-radius:12px;padding:16px;margin-bottom:20px;">
        <h3 style="margin:0 0 12px 0;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#132038;font-weight:700;">
          📚 Distribuição por Tipo de Estudo
        </h3>
        ${tipos.length === 0 ? `<p style="font-size:12px;color:#5A729C;margin:0;">Nenhuma sessão registrada nesta semana.</p>` : `
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            ${tipos.map((t) => `
              <tr>
                <td style="padding:6px 0;font-weight:600;color:#132038;width:35%;">${t.tipo}</td>
                <td style="padding:6px 8px;width:45%;">
                  <div style="background:#E6D9BE;height:8px;border-radius:999px;overflow:hidden;">
                    <div style="background:#AD8A4E;height:100%;width:${t.pct.toFixed(0)}%;border-radius:999px;"></div>
                  </div>
                </td>
                <td style="padding:6px 0;text-align:right;color:#5A729C;font-family:monospace;width:20%;">
                  ${formatDuration(t.sec)} (${t.pct.toFixed(1).replace(".", ",")}%)
                </td>
              </tr>
            `).join("")}
          </table>
        `}
      </div>

      <!-- Desempenho por Matéria -->
      <div style="background:#FAF8F3;border:1px solid #E6D9BE;border-radius:12px;padding:16px;margin-bottom:20px;">
        <h3 style="margin:0 0 12px 0;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#132038;font-weight:700;">
          🎯 Questões & Aproveitamento por Matéria
        </h3>
        ${materias.length === 0 ? `<p style="font-size:12px;color:#5A729C;margin:0;">Nenhuma matéria estudada na semana.</p>` : `
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="border-bottom:1px solid #E6D9BE;color:#5A729C;font-size:10px;text-transform:uppercase;font-weight:700;">
                <th style="padding:6px 0;text-align:left;">Matéria</th>
                <th style="padding:6px;text-align:center;">Tempo</th>
                <th style="padding:6px;text-align:center;">Questões</th>
                <th style="padding:6px;text-align:center;">Var. Questões</th>
                <th style="padding:6px;text-align:center;">% Acerto</th>
                <th style="padding:6px;text-align:right;">Var. % Acerto</th>
              </tr>
            </thead>
            <tbody>
              ${materias.map((m) => `
                <tr style="border-bottom:1px solid #F1EBDC;">
                  <td style="padding:8px 0;font-weight:600;color:#132038;">
                    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${m.color};margin-right:4px;"></span>
                    [${m.sigla}] ${m.name}
                  </td>
                  <td style="padding:8px;text-align:center;font-family:monospace;color:#5A729C;">${formatDuration(m.sec)}</td>
                  <td style="padding:8px;text-align:center;font-family:monospace;font-weight:700;">${m.cFeitas > 0 ? `${m.cAcertos}/${m.cFeitas}` : "—"}</td>
                  <td style="padding:8px;text-align:center;">${m.cFeitas > 0 ? fmtVarBadge(m.mQuestVar) : "—"}</td>
                  <td style="padding:8px;text-align:center;font-family:monospace;font-weight:700;">${m.cFeitas > 0 ? m.cPct.toFixed(1).replace(".", ",") + "%" : "—"}</td>
                  <td style="padding:8px;text-align:right;">${m.cFeitas > 0 ? fmtVarBadge(m.mPctVar, true) : "—"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        `}
      </div>

      <p style="margin:24px 0 0 0;font-size:11px;color:#8398B8;text-align:center;line-height:1.5;">
        Este e-mail foi gerado automaticamente pelo seu painel de Controle de Estudos.<br>
        Enviado todo sábado às 23:59 para acompanhar a sua evolução constante.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: any = {};
    try {
      body = await req.json();
    } catch (_) {
      body = {};
    }

    const authHeader = req.headers.get("Authorization");
    let targetUser: any = null;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      targetUser = user;
    }

    const range = getSundaySaturdayRange(body?.referenceDate);

    // Se foi chamado com token de usuário (disparo de teste manual)
    if (targetUser) {
      const { data: stateRow } = await supabase
        .from("user_state")
        .select("payload")
        .eq("user_id", targetUser.id)
        .maybeSingle();

      const state = stateRow?.payload || {};
      const html = generateReportHtml(targetUser.email, state, range);

      if (resendApiKey) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Controle de Estudos <estudos@resend.dev>",
            to: [targetUser.email],
            subject: `📊 Resumo Semanal de Estudos (${formatBR(range.curStart).slice(0, 5)} a ${formatBR(range.curEnd).slice(0, 5)})`,
            html: html,
          }),
        });
        const resData = await res.json();
        return new Response(JSON.stringify({ ok: true, email: targetUser.email, resend: resData }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true, email: targetUser.email, preview: true, html }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Se chamado pelo CRON (todos os usuários cadastrados)
    const { data: users, error: usersErr } = await supabase.from("user_state").select("user_id, payload");
    if (usersErr) throw usersErr;

    const results = [];
    for (const u of users || []) {
      const { data: userData } = await supabase.auth.admin.getUserById(u.user_id);
      const email = userData?.user?.email;
      if (!email) continue;

      const html = generateReportHtml(email, u.payload, range);

      if (resendApiKey) {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Controle de Estudos <estudos@resend.dev>",
              to: [email],
              subject: `📊 Resumo Semanal de Estudos (${formatBR(range.curStart).slice(0, 5)} a ${formatBR(range.curEnd).slice(0, 5)})`,
              html: html,
            }),
          });
          results.push({ email, status: res.status });
        } catch (e) {
          results.push({ email, error: (e as Error).message });
        }
      } else {
        results.push({ email, status: "resend_api_key_not_configured" });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
