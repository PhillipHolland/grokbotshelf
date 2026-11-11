// Trending order regressions. Runs the gbs-trend block in public/app.js (the same one the homepage uses).
// No browser. Usage: node test/trending.js
const fs = require("fs"), path = require("path");
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const src = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const block = src.match(/\/\* gbs-trend:start \*\/([\s\S]*?)\/\* gbs-trend:end \*\//);
if (!block) { console.log("FAIL app.js is missing the gbs-trend block"); process.exit(1); }
const gbsTrend = new Function(block[1] + "\nreturn gbsTrend;")();
const NOW = Date.parse("2026-11-10T12:00:00Z");
const order = (rows) => [...gbsTrend(rows, NOW)].sort((a, b) => a[1] - b[1]).map(([k]) => k);

let o = order([{ key: "old-many", creator: "a", net: 30, added: "2026-10-01" }, { key: "new-some", creator: "b", net: 6, added: "2026-11-09" }, { key: "old-none", creator: "c", net: 0, added: "2026-10-01" }]);
ok(o[0] === "new-some" && o[1] === "old-many" && o[2] === "old-none", "a new bot with a few votes passes an old one with many; no votes and old is last: " + o);

o = order([{ key: "same-a", creator: "a", net: 0, added: "2026-11-01" }, { key: "same-b", creator: "b", net: 0, added: "2026-11-01" }]);
ok(o.join() === "same-a,same-b", "ties keep the order given");

o = order([{ key: "down", creator: "a", net: -4, added: "2026-11-10" }, { key: "zero", creator: "b", net: 0, added: "2026-10-01" }]);
ok(o[0] === "zero", "a downvoted bot sinks below an unvoted one, however new");

// One prolific creator with five equal bots, three others with slightly weaker ones
const many = [1, 2, 3, 4, 5].map((n) => ({ key: "p" + n, creator: "prolific", net: 10, added: "2026-11-01" }));
const rest = ["x", "y", "z"].map((c) => ({ key: c, creator: c, net: 8, added: "2026-11-01" }));
o = order([...many, ...rest]);
ok(o[0] === "p1" && o.slice(0, 5).filter((k) => k[0] === "p").length <= 2, "one creator does not fill the top five: " + o.slice(0, 5));
ok(o.length === 8 && new Set(o).size === 8, "every bot keeps a place");

o = order([{ key: "bad-date", creator: "a", net: 50, added: "" }, { key: "fine", creator: "b", net: 1, added: "2026-11-09" }]);
ok(o.length === 2 && o[0] === "fine", "a missing date counts as very old, not as new");

// The real shelf with no votes yet: newest first, and no creator has more than 3 of the first 20
const bots = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "public", "bots.json"), "utf8"));
const rows = bots.map((b) => ({ key: b.name, creator: b.creator_handle || b.creator_name, net: 0, added: b.added }));
const top = order(rows).slice(0, 20), by = new Map(rows.map((r) => [r.key, r]));
const counts = {}; top.forEach((k) => { const c = by.get(k).creator; counts[c] = (counts[c] || 0) + 1; });
ok(Math.max(...Object.values(counts)) <= 3, "real shelf, no votes: at most 3 per creator in the first 20 (max " + Math.max(...Object.values(counts)) + ")");
