// Shared helpers for the build scripts and API routes. Keep in sync with public/app.js.
const fold = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const slugify = (s) => fold(s).replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// Template id: the part after https://x.ai/bot/ (marketplace links keep their path).
const templateId = (url) => String(url || "").replace(/^https:\/\/x\.ai\/(bot\/)?/, "");
// Deep link into the Grok Bot app, only for plain x.ai/bot/<id> links.
const appLink = (url) => {
  const m = String(url || "").match(/^https:\/\/x\.ai\/bot\/([A-Za-z0-9_-]+)\/?$/);
  return m ? "grokbot://app/v1/bot-template?id=" + m[1] : "";
};
const postId = (u) => (String(u || "").match(/\/status\/(\d+)/) || [])[1] || "";
// JSON-LD block. Every "<" becomes \u003c so a value containing "</script>" or "<!--" cannot end the script element.
const ldScript = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
module.exports = { fold, slugify, templateId, appLink, postId, ldScript };
