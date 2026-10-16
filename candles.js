// GET /api/candles?cls=stocks&symbol=AAPL&interval=1h  ->  { candles: [{t,o,h,l,c}, ...] } (oldest first)
const { INTERVALS, CLASSES, getCandles } = require("./_td");

module.exports = async (req, res) => {
  const key = process.env.TWELVEDATA_KEY;
  const fail = (code, error) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(code).json({ error });
  };
  if (!key) return fail(503, "TWELVEDATA_KEY is not set on the server.");

  const { cls = "", symbol = "", interval = "" } = req.query || {};
  if (!CLASSES.has(cls) || !/^[A-Za-z0-9][A-Za-z0-9.\-:]{0,19}(\/[A-Za-z0-9]{1,10})?$/.test(symbol) || !(interval in INTERVALS)) {
    return fail(400, "Bad request.");
  }

  const out = await getCandles(cls, symbol, interval, key, 600);
  if (!out.candles) return fail(out.status, out.error);
  const ttl = INTERVALS[interval];
  res.setHeader("Cache-Control", `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 3}`);
  res.status(200).json({ candles: out.candles });
};
