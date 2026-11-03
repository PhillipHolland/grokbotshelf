// One-shot: mark specific Neon submissions denied. Idempotent. Needs DATABASE_URL at build/runtime.
const IDS = [692, 697, 667];
const DB = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED || "";
if (!DB || DB.includes("[SENSITIVE]")) {
  console.warn("deny-pending-once: no DATABASE_URL in this environment; skip");
  process.exit(0);
}
async function sql(query, params = []) {
  const r = await fetch(`https://${new URL(DB).hostname}/sql`, {
    method: "POST",
    headers: { "Neon-Connection-String": DB, "Content-Type": "application/json" },
    body: JSON.stringify({ query, params }),
  });
  if (!r.ok) throw new Error(`neon ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).rows;
}
(async () => {
  const updated = await sql(
    `UPDATE submissions SET status = 'denied' WHERE id = ANY($1::bigint[]) AND status = 'pending' RETURNING id, title`,
    [IDS]
  );
  console.log("deny-pending-once updated", JSON.stringify(updated));
})().catch((e) => {
  console.error("deny-pending-once", e.message || e);
  process.exit(1);
});
