// Shared helpers for the Twelve Data endpoints. Files starting with "_" are not exposed as routes.
const INTERVALS = { "5min": 60, "15min": 120, "1h": 300, "4h": 600, "1day": 900, "1week": 1800 };
const CLASSES = new Set(["stocks", "etfs", "forex", "crypto", "indices"]);

function toSymbol(cls, s) {
  if (cls === "forex" && !s.includes("/") && s.length === 6) return s.slice(0, 3) + "/" + s.slice(3);
  if (cls === "crypto" && !s.includes("/")) return s + "/USD";
  return s;
}

// Returns { candles } (oldest first) or { status, error }.
async function getCandles(cls, symbol, interval, key, size) {
  try {
    const url =
      "https://api.twelvedata.com/time_series?symbol=" + encodeURIComponent(toSymbol(cls, symbol)) +
      "&interval=" + interval + "&outputsize=" + (size || 600) + "&order=ASC&timezone=UTC&apikey=" + encodeURIComponent(key);
    const r = await fetch(url);
    const j = await r.json();
    if (j.status === "error" || !Array.isArray(j.values)) {
      const code = Number(j.code);
      if (code === 429) return { status: 429, error: "Data provider rate limit reached. Wait a minute and try again." };
      if (code === 401) return { status: 502, error: "The data provider rejected the API key." };
      if (code === 400 || code === 403 || code === 404)
        return { status: 404, error: "This symbol or timeframe is not available on your data plan." };
      return { status: 502, error: "The data provider returned an error." };
    }
    const candles = j.values
      .map((v) => ({
        t: Date.parse(v.datetime.includes(" ") ? v.datetime.replace(" ", "T") + "Z" : v.datetime + "T00:00:00Z"),
        o: parseFloat(v.open), h: parseFloat(v.high), l: parseFloat(v.low), c: parseFloat(v.close),
      }))
      .filter((c) => [c.t, c.o, c.h, c.l, c.c].every(Number.isFinite))
      .sort((a, b) => a.t - b.t);
    return { candles };
  } catch (e) {
    return { status: 502, error: "Could not reach the data provider." };
  }
}

module.exports = { INTERVALS, CLASSES, toSymbol, getCandles };
