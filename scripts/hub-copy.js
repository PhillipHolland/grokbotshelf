// Visible copy for job hubs and stacks. Meta descriptions stay the short blurb.
// Each guide is who the list is for and how to pick, and must land at 80–150 words.
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

function guideText({ name, blurb, picks, also, categories, kind }) {
  const pick = joinNames(picks);
  const more = also.length ? joinNames(also) : "";
  const cat = joinNames(categories);
  const opener = blurb.replace(/\s+/g, " ").trim();
  const who = kind === "stack"
    ? `Use this stack when you want those bots in one order, not a pile of lookalikes.`
    : `Use this page when you know the job and want a short list, not the whole shelf.`;
  const how = kind === "stack"
    ? `Add them in the written order, starting with ${pick}. The next bot is the follow-through.`
    : `Start with ${pick}, the editors' picks, in the order to try them.`;
  const rest = more
    ? (kind === "stack"
      ? `After that, continue with ${more}. Stop when the outcome is covered.`
      : `If those miss the tool or household you have, read ${more} before you leave.`)
    : `Read each pick's description before you import.`;
  const free = `Each template is free. Open its page and use Get this bot. The shelf does not install it, and X likes are not a rating.`;
  const where = cat
    ? `These bots also sit in ${cat}. Open that category for every template in the group, not only the ones kept for ${name}.`
    : `Each bot still has its own page, with the creator and the import link.`;
  const close = kind === "stack"
    ? `You do not need a second stack that repeats this one.`
    : `If two bots sound the same, use the first pick once, then add another only if a gap remains.`;
  return [opener, who, how, rest, free, where, close].join(" ");
}

function assertGuide(where, text) {
  let parts = String(text).trim().split(/(?<=[.!?])\s+/);
  while (wordCount(parts.join(" ")) > 150 && parts.length > 5) parts.pop();
  const out = parts.join(" ");
  const n = wordCount(out);
  if (n < 80 || n > 150) throw new Error(`${where}: guide is ${n} words (need 80–150)`);
  return out;
}

function paragraphs(text) {
  const parts = words(text);
  const mid = Math.ceil(parts.length / 2);
  let cut = mid;
  while (cut < parts.length && !/[.!?]$/.test(parts[cut - 1])) cut++;
  if (cut >= parts.length - 20) cut = mid;
  return [parts.slice(0, cut).join(" "), parts.slice(cut).join(" ")];
}

function jobGuide(c) {
  const categories = catsOf(c.members).slice(0, 3);
  const text = guideText({
    name: c.name,
    blurb: c.blurb,
    picks: names(c.start, 3),
    also: names(c.rest, 3),
    categories,
    kind: "job",
  });
  return assertGuide(`collection ${c.slug}`, text);
}

function stackGuide(s) {
  const categories = catsOf(s.members).slice(0, 3);
  const text = guideText({
    name: s.title,
    blurb: s.blurb,
    picks: names(s.members, 1),
    also: names(s.members.slice(1), 5),
    categories,
    kind: "stack",
  });
  return assertGuide(`stack ${s.slug}`, text);
}

const INDEX = {
  collections: `Find by job is for a visitor who knows the task and does not know the bot. A category page lists every template under one shelf label. A job page is the short list for one decision, such as dinner, a claim, or a scam text. Start on the card whose name matches the thing you are trying to finish. Each hub names a few bots to open first, then the rest of that job. The order is the editors' order. The shelf has no install counts, so nothing here is ranked by popularity or by bookmarks on X. Import is one tap on the bot's own page, and the template is free. If the job is not listed, use the category pages or search on the home shelf.`,
  stacks: `A stack is a few bots in the order to add them, for one outcome. It is not a category, and it is not a job page that lists every similar template. Read the sentence under the title. If that is the week you are having, add the bots from top to bottom and stop when the job is covered. Each step links to the bot's own page, where Get this bot opens the free x.ai template. The shelf does not install the set for you, and it does not charge for the list. Order matters because the later bot is the follow-through: a log after a plan, a second look after a first read. If you only need one of them, open that bot and skip the rest. Related category pages are linked from each stack so you can see the wider set without losing this order.`,
};

function indexGuide(which) {
  const text = INDEX[which];
  return assertGuide(which + " index", text);
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
  wordCount, paragraphs, jobGuide, stackGuide, indexGuide, jobFaq, stacksFaq, faqLd, catsOf, cardPng,
};
