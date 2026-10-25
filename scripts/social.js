// Bookmark counts for "Most bookmarked". Two steps, because the X read happens through an agent's X tools:
//   node scripts/social.js ids            -> prints source-post ids in batches of 100 (one line per batch)
//   (call X get_posts_by_ids with post.fields=public_metrics for each line, save each raw JSON reply to a file)
//   node scripts/social.js merge a.json b.json   -> writes public/social.json with fetched_at
// Then commit and deploy. Counts are X bookmarks on the post that shared the bot, not ratings.
const fs = require("fs"), path = require("path");
const { postId } = require("./shelf");
const PUB = path.join(__dirname, "..", "public");
const bots = JSON.parse(fs.readFileSync(path.join(PUB, "bots.json"), "utf8"));
const [cmd, ...files] = process.argv.slice(2);
if (cmd === "ids") {
  const ids = [...new Set(bots.map((b) => postId(b.source_post)).filter(Boolean))];
  for (let i = 0; i < ids.length; i += 100) console.log(ids.slice(i, i + 100).join(","));
} else if (cmd === "merge" && files.length) {
  const posts = {};
  for (const f of files) {
    const t = fs.readFileSync(f, "utf8"), j = JSON.parse(t.slice(0, t.lastIndexOf("}") + 1).split("\n").find((l) => l.trim().startsWith("{")) || t);
    for (const p of j.data || []) { const m = p.public_metrics || {}; posts[p.id] = { bookmarks: m.bookmark_count || 0, likes: m.like_count || 0, reposts: m.repost_count || 0 }; }
  }
  fs.writeFileSync(path.join(PUB, "social.json"), JSON.stringify({ fetched_at: new Date().toISOString(), note: "Bookmark, like and repost counts of each bot source_post on X. Not ratings.", posts }) + "\n");
  console.log("social.json:", Object.keys(posts).length, "posts");
} else console.log("usage: node scripts/social.js ids | merge <file.json>...");
