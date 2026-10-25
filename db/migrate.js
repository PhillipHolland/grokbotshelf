// Apply db/schema.sql to Neon over its HTTP SQL endpoint (idempotent, no dependencies).
//   DATABASE_URL_UNPOOLED=... node db/migrate.js     (falls back to DATABASE_URL)
const fs = require("fs"), path = require("path");
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) { console.error("Set DATABASE_URL_UNPOOLED or DATABASE_URL"); process.exit(1); }
const stmts = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8").replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
(async () => {
  for (const query of stmts) {
    const r = await fetch(`https://${new URL(url).hostname}/sql`, { method: "POST", headers: { "Neon-Connection-String": url, "Content-Type": "application/json" }, body: JSON.stringify({ query, params: [] }) });
    if (!r.ok) { console.error(r.status, await r.text()); process.exit(1); }
    console.log("ok", query.split("\n")[0].slice(0, 60));
  }
})();
