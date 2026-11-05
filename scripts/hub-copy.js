// Visible copy for job hubs and stacks. Meta descriptions stay the short blurb.
// Each hub and stack carries its own hand-written guide in public/collections.json or public/stacks.json
// (the "guide" field next to blurb): a few plain sentences naming the picks and what each one does, written
// from the bots' own descriptions. The build renders it under the list, and refuses a hub without one.
const { cardPng } = require("./og-png");

function words(s) {
  return String(s || "").trim().split(/\s+/).filter(Boolean);
}
function wordCount(s) { return words(s).length; }
function names(list, n) {
  return list.slice(0, n).map((b) => b.name);
}
function joinNames(list) {
  if (list.length <= 1) return list[0] || "";
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}
function catsOf(members) {
  const n = new Map();
  for (const b of members) n.set(b.category, (n.get(b.category) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
}

// Hub and stack guides: 20 to 100 words. Index guides may run longer.
const GUIDE_MIN = 20, GUIDE_MAX = 100;
function assertGuide(where, text, min = GUIDE_MIN, max = GUIDE_MAX) {
  const out = String(text || "").replace(/[ \t]+/g, " ").trim();
  const n = wordCount(out);
  if (n < min || n > max) throw new Error(`${where}: guide is ${n} words (need ${min}–${max})`);
  if (/[—–]/.test(out)) throw new Error(`${where}: guide uses a dash; write it as two sentences or a comma`);
  return out;
}

// Paragraphs are separated by a blank line in the source text.
function paragraphs(text) {
  return String(text || "").split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function jobGuide(c) {
  if (!c.guide) throw new Error(`collection ${c.slug}: guide is required (a few plain sentences on the picks, from their own descriptions)`);
  return assertGuide(`collection ${c.slug}`, c.guide);
}

function stackGuide(s) {
  if (!s.guide) throw new Error(`stack ${s.slug}: guide is required (a few plain sentences on the bots, in install order)`);
  return assertGuide(`stack ${s.slug}`, s.guide);
}

const INDEX = {
  collections: `Find by job is for a visitor who knows the task and does not know the bot. A category page lists every template under one shelf label. A job page is the short list for one decision, such as dinner, a claim, or a scam text. Start on the card whose name matches the thing you are trying to finish. Each hub names a few bots to open first, then the rest of that job.

The order is the editors' order. The shelf has no install counts, so nothing here is ranked by popularity or by bookmarks on X. Import is one tap on the bot's own page, and the template is free. If the job is not listed, use the category pages or search on the home shelf.`,
  stacks: `A stack is a few bots in the order to add them, for one outcome. It is not a category, and it is not a job page that lists every similar template. Read the sentence under the title. If that is the week you are having, add the bots from top to bottom and stop when the job is covered. Each step links to the bot's own page, where Get this bot opens the free x.ai template.

The shelf does not install the set for you, and it does not charge for the list. Order matters because the later bot is the follow-through: a log after a plan, a second look after a first read. If you only need one of them, open that bot and skip the rest. Related category pages are linked from each stack so you can see the wider set without losing this order.`,
};

function indexGuide(which) {
  const text = INDEX[which];
  assertGuide(which + " index", text, 80, 150);
  return text;
}

function jobFaq(c) {
  const pick = joinNames(names(c.start, 3));
  const cats = catsOf(c.members).slice(0, 2);
  return [
    {
      q: `Who is the ${c.name} page for?`,
      a: `${c.blurb} This page is a short list for that job, not the full shelf.`,
    },
    {
      q: `Which bot should I open first?`,
      a: `Start with ${pick}. They are the editors' picks, written in the order to try them. The shelf does not have install counts, so this is not a popularity ranking.`,
    },
    {
      q: `How is this different from a category?`,
      a: cats.length
        ? `${cats.join(" and ")} ${cats.length > 1 ? "list" : "lists"} every template in ${cats.length > 1 ? "those groups" : "that group"}. This page keeps only the bots chosen for ${c.name}. Import any of them free from its own page.`
        : `A category lists every template with that label. This page keeps only the bots chosen for ${c.name}. Import is free from each bot page.`,
    },
  ];
}

function stacksFaq(stacks) {
  const first = stacks[0];
  return [
    {
      q: `What is a shelf stack?`,
      a: `A short install order for one outcome. ${first.title} is one of them: ${first.blurb}`,
    },
    {
      q: `Do I have to add every bot in the stack?`,
      a: `No. The order is the suggested sequence. Add the first bot, use it, and continue only if you still want the next step.`,
    },
    {
      q: `Is a stack a paid bundle?`,
      a: `No. The page is free, and each template is free to import into Grok Bot. The shelf does not sell the set.`,
    },
  ];
}

function faqLd(url, faqs) {
  return {
    "@type": "FAQPage",
    "@id": url + "#faq",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

module.exports = {
  wordCount, paragraphs, jobGuide, stackGuide, indexGuide, jobFaq, stacksFaq, faqLd, catsOf, cardPng, GUIDE_MIN, GUIDE_MAX,
};
