// Critical CSS for the bot and creator pages (perf round 6 #5): styles.css minus the rules that can't match anything
// on those pages, inlined in a <style> so the first paint doesn't wait for a stylesheet round trip.
// Conservative by design: a selector is dropped only when it needs a class or id that appears nowhere in the pages'
// HTML (any word, not just class attributes) or in the scripts they load. Element, attribute and pseudo selectors,
// :root, @keyframes, @font-face and the like always stay; selectors inside :not() :is() :where() :has() are ignored
// when deciding, so a rule is never dropped because of an argument there. Rules keep their order.
// Usage: pageCss(cssText, wordSet) -> cssText; words(text, set) adds every [A-Za-z0-9_-] word of text to set.
const words = (text, set = new Set()) => { for (const m of text.matchAll(/[A-Za-z_][\w-]*/g)) set.add(m[0]); return set; };
// Split a CSS text into top-level items: { pre, body } for blocks (pre is the selector or at-rule prelude), { stmt } for
// at-statements (@import...). Handles comments and strings; nested braces stay inside body.
function items(css) {
  const out = []; let i = 0, start = 0;
  const skipStr = (q) => { i++; while (i < css.length && css[i] !== q) { if (css[i] === "\\") i++; i++; } };
  while (i < css.length) {
    const c = css[i];
    if (c === "/" && css[i + 1] === "*") { const e = css.indexOf("*/", i + 2); i = e < 0 ? css.length : e + 2; if (css.slice(start, i).trim().startsWith("/*")) start = i; continue; }
    if (c === '"' || c === "'") { skipStr(c); i++; continue; }
    if (c === ";") { const s = css.slice(start, i + 1).trim(); if (s) out.push({ stmt: s }); i++; start = i; continue; }
    if (c === "{") {
      const pre = css.slice(start, i).trim(); let depth = 1, j = i + 1;
      while (j < css.length && depth) {
        const d = css[j];
        if (d === "/" && css[j + 1] === "*") { const e = css.indexOf("*/", j + 2); j = e < 0 ? css.length : e + 2; continue; }
        if (d === '"' || d === "'") { j++; while (j < css.length && css[j] !== d) { if (css[j] === "\\") j++; j++; } j++; continue; }
        if (d === "{") depth++; else if (d === "}") depth--;
        j++;
      }
      out.push({ pre, body: css.slice(i + 1, j - 1) }); i = j; start = i; continue;
    }
    i++;
  }
  return out;
}
// Split a selector list on top-level commas
function splitList(sel) {
  const out = []; let depth = 0, cur = "";
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === "(" || c === "[") depth++; else if (c === ")" || c === "]") depth--;
    if (c === "," && !depth) { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}
// The class and id names a selector requires (outside functional pseudo-classes and attribute selectors)
function needs(sel) {
  let s = "", depth = 0;
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === "(" || c === "[") { depth++; continue; }
    if (c === ")" || c === "]") { depth--; continue; }
    if (!depth) s += c;
  }
  return [...s.matchAll(/[.#](-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]);
}
const KEEP_AT = /^@(keyframes|-webkit-keyframes|font-face|property|page|counter-style|font-feature-values)\b/i;
const RECURSE_AT = /^@(media|supports|container|layer|document)\b/i;
function prune(css, have) {
  let out = "";
  for (const it of items(css)) {
    if (it.stmt) { out += it.stmt; continue; }
    if (it.pre.startsWith("@")) {
      if (KEEP_AT.test(it.pre)) out += `${it.pre}{${it.body}}`;
      else if (RECURSE_AT.test(it.pre)) { const inner = prune(it.body, have); if (inner) out += `${it.pre}{${inner}}`; }
      else out += `${it.pre}{${it.body}}`;
      continue;
    }
    const keep = splitList(it.pre).filter((s) => needs(s).every((n) => have.has(n)));
    if (keep.length) out += `${keep.join(",")}{${it.body.trim()}}`;
  }
  return out;
}
// comments go first (styles.css has no "/*" inside a string), then a whitespace squeeze that leaves strings alone
const pageCss = (css, have) => prune(css.replace(/\/\*[\s\S]*?\*\//g, ""), have)
  .replace(/("[^"]*"|'[^']*')|\s*\n\s*/g, (m, q) => q || " ").replace(/("[^"]*"|'[^']*')|\s*([{};])\s*/g, (m, q, p) => q || p);
module.exports = { pageCss, words, items };
