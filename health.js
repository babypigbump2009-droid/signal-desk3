// Tells the page which backends are configured. Never returns the keys themselves.
module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const e = process.env;
  res.status(200).json({
    data: Boolean(e.TWELVEDATA_KEY),
    ai: Boolean(e.ANTHROPIC_API_KEY),
    mail: Boolean(e.RESEND_API_KEY && e.MAIL_FROM && e.SUPABASE_URL && e.SUPABASE_SERVICE_KEY && e.CRON_SECRET),
  });
};
