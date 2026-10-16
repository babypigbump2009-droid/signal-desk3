// Public settings for sign-in. The anon key is designed to be public; your data stays protected by the
// row-level-security rules in supabase.sql. Never put the service_role key here.
module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  res.status(200).json(url && key ? { url, key } : {});
};
