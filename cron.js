// GET /api/cron  (called on a schedule)  ->  checks open trades and tracked picks for everyone who turned on
// email alerts, and emails them when a stop or target has been reached.
// Needs: CRON_SECRET, TWELVEDATA_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, MAIL_FROM.
const crypto = require("crypto");
const { CLASSES, getCandles } = require("./_td");

const TFAPI = { "5m": "5min", "15m": "15min", "1h": "1h", "4h": "4h", "1D": "1day", "1W": "1week" };
const SYM = /^[A-Za-z0-9][A-Za-z0-9.\-:]{0,19}$/;
const PER_RUN = Number(process.env.CRON_MAX_SYMBOLS) || 8; // free Twelve Data plans allow about 8 requests a minute

function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}
function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return safeEq(bearer, secret) || safeEq((req.query && req.query.key) || "", secret);
}
const num = (v) => typeof v === "number" && Number.isFinite(v);

// Everything a user wants watched, with its levels. Values from the database are re-validated here.
function tasksFor(row) {
  const done = new Set(Array.isArray(row.alerted) ? row.alerted : []);
  const out = [];
  (Array.isArray(row.history) ? row.history : []).forEach((e, i) => {
    const t = e && e.tk;
    if (!e || !t || e.st !== "pending" || !e.live || typeof e.id !== "string" || done.has(e.id)) return;
    if (!CLASSES.has(e.c) || !SYM.test(String(e.s)) || !TFAPI[e.tf] || !["Long", "Short"].includes(e.d)) return;
    if (![t.sl, t.tp, e.dt, t.tt].every(num)) return;
    out.push({ kind: "trade", id: e.id, idx: i, cls: e.c, sym: e.s, tf: e.tf, dir: e.d, sl: t.sl, tp: t.tp, from: Math.max(e.dt, t.tt) });
  });
  (Array.isArray(row.watchlist) ? row.watchlist : []).forEach((w, i) => {
    const lv = w && w.lv;
    if (!lv || lv.done || !w || !CLASSES.has(w.c) || !SYM.test(String(w.s)) || !TFAPI[lv.tf]) return;
    if (!["Long", "Short"].includes(lv.d) || ![lv.sl, lv.tp, lv.t].every(num)) return;
    const id = "wl:" + w.c + ":" + w.s + ":" + lv.t;
    if (done.has(id)) return;
    out.push({ kind: "level", id, idx: i, cls: w.c, sym: w.s, tf: lv.tf, dir: lv.d, sl: lv.sl, tp: lv.tp, from: lv.t });
  });
  return out;
}

// First candle after `from` that touches the stop or the target. Both in one candle counts as the stop.
function firstHit(task, candles) {
  const sg = task.dir === "Long" ? 1 : -1;
  for (const c of candles) {
    if (c.t <= task.from) continue;
    const hitSl = sg > 0 ? c.l <= task.sl : c.h >= task.sl;
    const hitTp = sg > 0 ? c.h >= task.tp : c.l <= task.tp;
    if (hitSl || hitTp) return { stop: hitSl, t: c.t };
  }
  return null;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized." });
  const e = process.env;
  const base = String(e.SUPABASE_URL || "").replace(/\/$/, "");
  if (!(e.TWELVEDATA_KEY && base && e.SUPABASE_SERVICE_KEY && e.RESEND_API_KEY && e.MAIL_FROM))
    return res.status(503).json({ error: "Email alerts are not fully configured on the server." });

  const sb = { apikey: e.SUPABASE_SERVICE_KEY, Authorization: "Bearer " + e.SUPABASE_SERVICE_KEY };
  const summary = { users: 0, checked: 0, hits: 0, emails: 0, errors: 0 };
  try {
    const r = await fetch(base + "/rest/v1/user_data?alerts_email=eq.true&select=user_id,watchlist,history,alerted&limit=1000", { headers: sb });
    if (!r.ok) return res.status(502).json({ error: "Could not read user data." });
    const rows = await r.json();
    if (!Array.isArray(rows)) return res.status(502).json({ error: "Could not read user data." });

    const work = rows.map((row) => ({ row, tasks: tasksFor(row) })).filter((w) => w.tasks.length);
    summary.users = work.length;
    const keys = [...new Set(work.flatMap((w) => w.tasks.map((t) => t.cls + "|" + t.sym + "|" + t.tf)))].sort();
    // Free data plans are rate limited, so each run covers a slice of the symbols and the next run takes the next slice.
    const slices = Math.max(1, Math.ceil(keys.length / PER_RUN));
    const start = (Math.floor(Date.now() / 60000) % slices) * PER_RUN;
    const mine = new Set(keys.slice(start, start + PER_RUN));
    const candles = new Map();
    for (const k of mine) {
      const [cls, sym, tf] = k.split("|");
      const out = await getCandles(cls, sym, TFAPI[tf], e.TWELVEDATA_KEY, 600);
      if (out.candles) candles.set(k, out.candles); else summary.errors++;
    }

    for (const { row, tasks } of work) {
      const hits = [];
      for (const t of tasks) {
        const cs = candles.get(t.cls + "|" + t.sym + "|" + t.tf);
        if (!cs) continue;
        summary.checked++;
        const h = firstHit(t, cs);
        if (h) hits.push({ t, h });
      }
      if (!hits.length) continue;
      summary.hits += hits.length;

      const history = Array.isArray(row.history) ? row.history.slice() : [];
      const watchlist = Array.isArray(row.watchlist) ? row.watchlist.slice() : [];
      const alerted = (Array.isArray(row.alerted) ? row.alerted : []).concat(hits.map((x) => x.t.id)).slice(-300);
      for (const { t, h } of hits) {
        if (t.kind === "trade") {
          const en = history[t.idx];
          en.st = h.stop ? "lost" : "won"; en.rt = h.t;
          en.tk = Object.assign({}, en.tk, { ex: h.stop ? t.sl : t.tp, xt: h.t });
        } else {
          watchlist[t.idx] = Object.assign({}, watchlist[t.idx], { lv: Object.assign({}, watchlist[t.idx].lv, { done: 1 }) });
        }
      }

      // Email address comes from the account itself, never from data the user can edit.
      let email = "";
      try {
        const u = await fetch(base + "/auth/v1/admin/users/" + encodeURIComponent(row.user_id), { headers: sb });
        if (u.ok) email = String((await u.json()).email || "");
      } catch (err) { /* handled below */ }
      if (!email) { summary.errors++; continue; }

      const lines = hits.map(({ t, h }) =>
        `${t.sym} (${t.tf}, ${t.dir}): ${h.stop ? "stop loss" : "take profit"} level ${h.stop ? t.sl : t.tp} was reached${t.kind === "trade" ? " on a trade you took" : " on a tracked pick"}.`);
      const sent = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + e.RESEND_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: e.MAIL_FROM,
          to: [email],
          subject: hits.length === 1 ? `Signal Desk: ${hits[0].t.sym} reached its ${hits[0].h.stop ? "stop loss" : "take profit"}` : `Signal Desk: ${hits.length} alerts`,
          text: lines.join("\n") + "\n\nOpen Signal Desk to review and close the trade. Alerts are based on market candles and can lag the real price. Not financial advice.",
        }),
      }).catch(() => null);
      if (!sent || !sent.ok) { summary.errors++; continue; } // not marked as alerted, so the next run tries again

      summary.emails++;
      const p = await fetch(base + "/rest/v1/user_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: Object.assign({ "Content-Type": "application/json", Prefer: "return=minimal" }, sb),
        body: JSON.stringify({ history, watchlist, alerted }),
      }).catch(() => null);
      if (!p || !p.ok) summary.errors++;
    }
    res.status(200).json(summary);
  } catch (err) {
    res.status(500).json({ error: "Check failed.", summary });
  }
};
