// scripts/validate.js: the bots.json checks the build runs first. Fixture listings for each rule, then the real
// public/bots.json must have no errors. No browser. Usage: node test/validate.js
const path = require("path");
const { validateBots, readBots } = require("../scripts/validate");
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };

const PUB = path.join(__dirname, "..", "public");
const good = {
  name: "Disk Doctor", emoji: "💽", description: "One plain sentence about what it does.", category: "Apple & Mac",
  url: "https://x.ai/bot/AbCdEf123", creator_name: "Nick", creator_handle: "@thecsguy", creator_url: "https://x.com/thecsguy",
  creator_avatar: "", source_post: "https://x.com/thecsguy/status/1234567890", added: "2026-10-24",
};
const other = { ...good, name: "Mail Mender", url: "https://x.ai/bot/ZyXwVu987" };
const opts = { pub: PUB, today: "2026-11-16" };
const check = (patch, { index = 0 } = {}) => {
  const list = [{ ...good, ...patch }, other];
  for (const [k, v] of Object.entries(patch)) if (v === undefined) delete list[index][k];
  return validateBots(list, opts);
};
const fails = (patch, re, m) => { const { errors } = check(patch); ok(errors.some((e) => re.test(e)), `${m} (${errors[0] || "no error"})`); };
const warns = (patch, re, m) => { const { errors, warnings } = check(patch); ok(!errors.length && warnings.some((w) => re.test(w)), `${m} (${warnings.find((w) => re.test(w)) || errors[0] || "no warning"})`); };

{ const r = validateBots([good, other], opts); ok(!r.errors.length && !r.warnings.length, "a well-formed listing has no errors and no warnings"); }
ok(validateBots({}, opts).errors.length === 1, "a non-array bots.json is an error");
ok(validateBots([null], opts).errors.some((e) => /must be an object/.test(e)), "a null entry is an error");

// Required fields and whitespace
for (const k of ["name", "emoji", "description", "category", "url", "added"]) fails({ [k]: "" }, new RegExp(`"${k}" is required`), `empty ${k} is an error`);
fails({ name: undefined }, /"name" is required/, "a missing name is an error");
fails({ name: "Disk Doctor " }, /leading or trailing spaces/, "trailing space in a field is an error");
fails({ name: "🤖🤖" }, /no page slug/, "a name with no letters or digits is an error");
fails({ description: "x".repeat(401) }, /description is 401 characters/, "a description over 400 characters is an error");

// Duplicates
{ const r = validateBots([good, { ...other, name: "disk-doctor" }], opts); ok(r.errors.some((e) => /same page slug "\/bot\/disk-doctor"/.test(e)), "two names with the same slug are an error"); }
{ const r = validateBots([good, { ...other, url: good.url }], opts); ok(r.errors.some((e) => /same template link/.test(e)), "two bots with the same template link are an error"); }

// Links
fails({ url: "https://x.ai/bot/" }, /should look like https:\/\/x\.ai\/bot/, "a template link with no id is an error");
fails({ url: "http://x.ai/bot/AbCdEf123" }, /should look like/, "an http template link is an error");
fails({ url: "https://x.com/bot/AbCdEf123" }, /should look like/, "a template link on another host is an error");
ok(!check({ url: "https://x.ai/marketplace/bots/deal-hunting" }).errors.length, "a marketplace link is allowed");
warns({ url: "https://x.ai/bot/marketplace/bots/deal-hunting" }, /mixes the \/bot\/ and \/marketplace\/ forms/, "a /bot/marketplace/ link is a warning");
fails({ source_post: "https://twitter.com/thecsguy/status/1234567890" }, /source_post/, "a source_post on twitter.com is an error (store x.com links)");
fails({ source_post: "https://x.com/thecsguy" }, /source_post/, "a source_post that is not a post is an error");
ok(!check({ source_post: undefined }).errors.length, "source_post is optional");
fails({ code_url: "github.com/x/y" }, /code_url/, "a code_url without https is an error");

// Dates
fails({ added: "2026-02-30" }, /real date/, "an impossible date is an error");
fails({ added: "10/24/2026" }, /real date/, "a date in another format is an error");
fails({ added: "2026-12-01" }, /in the future/, "a date in the future is an error");
ok(!check({ added: "2026-11-17" }).errors.length, "tomorrow is allowed (time zones)");

// Creator credit
fails({ creator_handle: "thecsguy" }, /creator_handle "thecsguy"/, "a handle without @ is an error");
fails({ creator_handle: "@has space" }, /creator_handle/, "a handle with a space is an error");
fails({ creator_url: "https://x.com/someoneelse" }, /does not match creator_handle/, "a creator_url for another handle is an error");
ok(!check({ creator_url: "https://x.com/TheCSGuy" }).errors.length, "creator_url casing may differ from the handle");
fails({ creator_handle: "", creator_name: "", creator_url: "https://x.com/thecsguy" }, /creator_url is set but creator_handle is empty/, "a creator_url with no handle is an error");
warns({ creator_handle: "", creator_name: "", creator_url: "" }, /no creator credit/, "no creator at all is a warning");
warns({ creator_name: "" }, /no creator_name/, "a handle with no name is a warning");
{ const r = validateBots([good, { ...other, creator_name: "Nicholas" }], opts); ok(r.warnings.some((w) => /@thecsguy is credited under 2 names/.test(w)), "one handle under two names is a warning"); }

// Avatars
fails({ creator_avatar: "/avatars/nobody-has-this-file.webp" }, /not in public\/avatars/, "an avatar file that does not exist is an error");
fails({ creator_avatar: "https://pbs.twimg.com/x.jpg" }, /should be \/avatars\//, "a remote avatar is an error");
{ const real = readBots(PUB).find((b) => b.creator_avatar).creator_avatar; ok(!check({ creator_avatar: real }).errors.length, `an avatar that exists passes (${real})`); }

// Typos and optional "Under the hood" fields
warns({ descripton: "typo" }, /unknown field "descripton"/, "an unknown field is a warning");
fails({ sends: "yes" }, /sends should be true or false/, "sends must be a boolean");
fails({ connectors: "Gmail" }, /connectors should be a list/, "connectors must be a list");
fails({ routines: [{ schedule: "daily" }] }, /routines should be a list/, "each routine needs a name");
ok(!check({ connectors: ["Gmail"], routines: [{ name: "Digest", schedule: "daily 8am" }], sends: true, posts: false, spends: false, permissions_note: "Reads mail.", needs: "A Gmail account.", limits: "Does not send." }).errors.length && !check({ needs: "x" }).warnings.length,
  "every documented optional field passes");

// Categories
{ const r = validateBots([good, other, { ...other, name: "Third", url: "https://x.ai/bot/Third0001", category: "apple and mac" }], opts);
  ok(r.warnings.some((w) => /"apple and mac" is used by this bot only \(did you mean "Apple & Mac"\?\)/.test(w)), "a one-bot category that slugs like another is a warning with a suggestion"); }

// Every error message names the bot so it can be found.
{ const r = check({ url: "nope", added: "nope" }); ok(r.errors.length === 2 && r.errors.every((e) => e.startsWith('bots.json[0] "Disk Doctor": ')), "errors name the index and the bot"); }

// The real catalog.
{
  const bots = readBots(PUB), r = validateBots(bots, { pub: PUB });
  ok(!r.errors.length, `public/bots.json (${bots.length} bots) has no errors${r.errors.length ? ": " + r.errors.slice(0, 5).join(" | ") : ""}`);
}
