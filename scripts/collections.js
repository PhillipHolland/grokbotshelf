// Job hubs ("Find by job"). public/collections.json lists curated pages for visitors who
// are not sure which similar bot to open. This does not merge templates, delete bots, or
// replace the category browse. The older bot-meta "collections" tags (Family, and so on)
// stay a filter on the home page. These hubs are separate pages.
//
// Ranking. The shelf has no Template Rewards / installs feed, so this file must not invent
// counts and the pages must not print any. Order today:
//   picks (or rank): 1 to 3 editor slugs, shown as "Start here" in the order written
//   bots: every member, in the order written; anyone who is not a pick is "More like this"
// A member may be a bot slug (archivist) or a template url (https://x.ai/bot/<id>).
//
// Usage later. Pass usageByTemplateId into rankJobMembers and it sorts by that number
// instead of the editor order. The map is { [templateId]: number } where templateId is the
// part after https://x.ai/bot/. Missing keys count as 0. Ties keep the editor order
// (the order of `bots`). The highlighted set is then the first 1 to 3 after that sort.
// Do not display the numbers until a real feed exists. Plug the map in at the
// usageByTemplateId = null line in scripts/build.js. Nothing here fetches it.
const { templateId } = require("./shelf");

function rankJobMembers(members, pickSlugs, usageByTemplateId) {
  const order = new Map(members.map((b, i) => [b.slug, i]));
  const picks = pickSlugs.filter((s) => order.has(s)).slice(0, 3);
  if (!usageByTemplateId) {
    const start = picks.map((s) => members[order.get(s)]);
    const picked = new Set(start.map((b) => b.slug));
    return { start, rest: members.filter((b) => !picked.has(b.slug)), by: "editors" };
  }
  const score = (b) => {
    const n = Number(usageByTemplateId[templateId(b.url)]);
    return Number.isFinite(n) ? n : 0;
  };
  const sorted = members.slice().sort((a, b) => score(b) - score(a) || order.get(a.slug) - order.get(b.slug));
  // Usage replaces the editor list: up to three highlighted, the rest follow in the same order.
  const n = Math.min(3, sorted.length);
  return { start: sorted.slice(0, n), rest: sorted.slice(n), by: "usage" };
}

// items: build.js bot records (slug, url, name, ...). data: parsed collections.json.
// Returns the hubs with members resolved to those records, in file order.
function loadCollections(data, items) {
  const list = Array.isArray(data) ? data : (data && Array.isArray(data.collections) ? data.collections : []);
  const bySlug = new Map(items.map((b) => [b.slug, b]));
  const byUrl = new Map(items.map((b) => [String(b.url || "").replace(/\/$/, ""), b]));
  const byId = new Map(items.map((b) => [templateId(b.url), b]));
  const resolveRef = (ref) => {
    const s = String(ref || "").trim();
    if (!s) return null;
    if (bySlug.has(s)) return bySlug.get(s);
    const url = s.replace(/\/$/, "");
    if (byUrl.has(url)) return byUrl.get(url);
    const id = templateId(s);
    if (id && byId.has(id)) return byId.get(id);
    return null;
  };
  const seen = new Set();
  return list.map((raw, i) => {
    const where = `collections.json #${i + 1}${raw && raw.slug ? ` (${raw.slug})` : ""}`;
    if (!raw || typeof raw !== "object") throw new Error(`${where}: expected an object`);
    const slug = String(raw.slug || "").trim();
    const name = String(raw.name || "").trim();
    const emoji = String(raw.emoji || "").trim();
    const icon = String(raw.icon || "").trim();
    const blurb = String(raw.blurb || "").trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`${where}: slug must be lowercase words separated by dashes`);
    if (seen.has(slug)) throw new Error(`${where}: duplicate slug`);
    seen.add(slug);
    if (!name) throw new Error(`${where}: name is required`);
    if (!emoji) throw new Error(`${where}: emoji is required`);
    if (!blurb) throw new Error(`${where}: blurb is required`);
    const refs = Array.isArray(raw.bots) ? raw.bots : null;
    const pickRefs = Array.isArray(raw.picks) ? raw.picks : (Array.isArray(raw.rank) ? raw.rank : null);
    if (!refs || !refs.length) throw new Error(`${where}: bots must list at least one slug or template url`);
    if (!pickRefs || pickRefs.length < 1 || pickRefs.length > 3) throw new Error(`${where}: picks (or rank) must list 1 to 3 bots`);
    const members = [];
    const have = new Set();
    for (const ref of refs) {
      const b = resolveRef(ref);
      if (!b) throw new Error(`${where}: unknown bot "${ref}". Use a bot slug or an https://x.ai/bot/<id> url.`);
      if (have.has(b.slug)) continue;
      have.add(b.slug);
      members.push(b);
    }
    const pickSlugs = [];
    for (const ref of pickRefs) {
      const b = resolveRef(ref);
      if (!b) throw new Error(`${where}: unknown pick "${ref}"`);
      if (!have.has(b.slug)) throw new Error(`${where}: pick "${b.slug}" is not in bots`);
      if (!pickSlugs.includes(b.slug)) pickSlugs.push(b.slug);
    }
    if (pickSlugs.length < 1) throw new Error(`${where}: picks resolved to nothing`);
    if (members.length < pickSlugs.length + 1) throw new Error(`${where}: add at least one bot besides the picks, so the page can show "More like this"`);
    return { id: String(raw.id || slug).trim() || slug, slug, name, emoji, icon, blurb, pickSlugs, members };
  });
}

module.exports = { loadCollections, rankJobMembers };
