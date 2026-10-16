// POST /api/ai  { prompt }  ->  JSON object produced by Claude
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: "ANTHROPIC_API_KEY is not set on the server." });
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });

  // Only accept calls made from this site's own pages.
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: "Forbidden." });
    } catch (e) {
      return res.status(403).json({ error: "Forbidden." });
    }
  }

  // When accounts are enabled, only signed-in users can use the AI (protects your Anthropic credit).
  const sbUrl = process.env.SUPABASE_URL, sbKey = process.env.SUPABASE_ANON_KEY;
  if (sbUrl && sbKey) {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Sign in to use AI analysis." });
    try {
      const u = await fetch(sbUrl.replace(/\/$/, "") + "/auth/v1/user", {
        headers: { apikey: sbKey, Authorization: "Bearer " + token },
      });
      if (!u.ok) return res.status(401).json({ error: "Sign in to use AI analysis." });
    } catch (e) {
      return res.status(502).json({ error: "Could not verify your sign-in." });
    }
  }

  const prompt = req.body && req.body.prompt;
  if (typeof prompt !== "string" || prompt.length < 10 || prompt.length > 6000) {
    return res.status(400).json({ error: "Bad request." });
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: 700,
        system: "You are a cautious markets analyst. Reply with a single JSON object and nothing else.",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: "The AI service returned an error." });
    const text = ((j.content || []).find((b) => b.type === "text") || {}).text || "";
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    if (a < 0 || b <= a) return res.status(502).json({ error: "The AI reply was not valid." });
    res.status(200).json(JSON.parse(text.slice(a, b + 1)));
  } catch (e) {
    res.status(502).json({ error: "The AI request failed." });
  }
};
