// GET /api/search?q=apple -> { results: [{c, s, n}] }   (c = market class used by the dashboard)
const TYPE = {
  "common stock": "stocks", "etf": "etfs", "physical currency": "forex",
  "digital currency": "crypto", "index": "indices",
};

module.exports = async (req, res) => {
  const key = process.env.TWELVEDATA_KEY;
  res.setHeader("Cache-Control", "no-store");
  if (!key) return res.status(503).json({ error: "TWELVEDATA_KEY is not set on the server." });
  const q = String((req.query && req.query.q) || "").trim().slice(0, 40);
  if (q.length < 2) return res.status(200).json({ results: [] });
  try {
    const url = "https://api.twelvedata.com/symbol_search?outputsize=25&symbol=" + encodeURIComponent(q);
    const r = await fetch(url, { headers: { Authorization: "apikey " + key } });
    const j = await r.json();
    const seen = new Set();
    const results = [];
    for (const d of Array.isArray(j.data) ? j.data : []) {
      const c = TYPE[String(d.instrument_type || "").toLowerCase()];
      if (!c) continue;
      let s = String(d.symbol || "");
      if (c === "forex") s = s.replace("/", "");
      if (c === "crypto") {
        if (!s.endsWith("/USD")) continue;
        s = s.slice(0, -4);
      }
      if (c === "stocks" || c === "etfs") {
        if (d.country && d.country !== "United States") continue; // keep US listings, which the free plan covers
      }
      if (!/^[A-Za-z0-9.\-:]{1,20}$/.test(s) || seen.has(c + s)) continue;
      seen.add(c + s);
      results.push({ c, s, n: String(d.instrument_name || s) });
      if (results.length >= 8) break;
    }
    res.status(200).json({ results });
  } catch (e) {
    res.status(502).json({ error: "Search failed." });
  }
};
