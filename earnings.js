// GET /api/earnings?symbol=AAPL  ->  { date: "YYYY-MM-DD" | null }   (next earnings date, if the data plan includes it)
module.exports = async (req, res) => {
  const key = process.env.TWELVEDATA_KEY;
  const none = (cache) => {
    res.setHeader("Cache-Control", cache || "public, s-maxage=600");
    res.status(200).json({ date: null });
  };
  if (!key) { res.setHeader("Cache-Control", "no-store"); return res.status(503).json({ error: "TWELVEDATA_KEY is not set on the server." }); }
  const symbol = String((req.query && req.query.symbol) || "");
  if (!/^[A-Za-z0-9][A-Za-z0-9.\-:]{0,19}$/.test(symbol)) { res.setHeader("Cache-Control", "no-store"); return res.status(400).json({ error: "Bad request." }); }
  try {
    const r = await fetch("https://api.twelvedata.com/earnings?symbol=" + encodeURIComponent(symbol) + "&apikey=" + encodeURIComponent(key));
    const j = await r.json();
    // Plans without the earnings endpoint, unknown symbols and rate limits all land here: report "no date" quietly.
    if (!j || j.status === "error" || !Array.isArray(j.earnings)) return none(Number(j && j.code) === 429 ? "no-store" : null);
    const today = new Date().toISOString().slice(0, 10);
    const next = j.earnings
      .map((e) => (e && typeof e.date === "string" ? e.date.slice(0, 10) : ""))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today)
      .sort()[0];
    res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=43200");
    res.status(200).json({ date: next || null });
  } catch (e) {
    none("no-store");
  }
};
