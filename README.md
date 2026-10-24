# Grok Bot Shelf

A community directory of shared Grok Bot templates, curated by Phillip Holland.
Live at https://grokbotshelf.vercel.app

Plain static site: `public/index.html`, `public/styles.css`, `public/app.js`.
Every card comes from `public/bots.json`.

## Add a bot

Add an object to the array in `public/bots.json`:

```json
{
  "name": "Disk Doctor",
  "emoji": "💽",
  "description": "One plain sentence about what it does.",
  "category": "Apple & Mac",
  "url": "https://x.ai/bot/XXXXXXXX",
  "creator_name": "Nick",
  "creator_handle": "@thecsguy",
  "creator_url": "https://x.com/thecsguy",
  "source_post": "https://x.com/thecsguy/status/123",
  "added": "2026-10-24"
}
```

Optional: `"code_url"` adds a source-code button. A new `creator_url` gets its own
section and filter chip automatically; a new `category` gets its own chip.

Check the template link works first: `curl -sI https://x.ai/bot/XXXXXXXX | head -1`

## Redeploy (one command)

```sh
cd /workspace/bot-hub && vercel deploy --prod --yes
```

## Launch post link

Paste the X launch post URL into `public/config.js` (`window.LAUNCH_POST_URL = "..."`)
and redeploy. Until it is set, the "Add your bot" section shows plain text with no link.

## Share image and icons

`public/og.png` (1200x630) is rendered from `build/og.html` with headless Chrome:

```sh
google-chrome --headless=new --no-sandbox --hide-scrollbars --window-size=1200,630 \
  --screenshot=public/og.png file://$PWD/build/og.html
```
