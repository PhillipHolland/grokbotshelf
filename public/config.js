// Site settings. Paste the launch post link between the quotes, then redeploy.
// While empty, the "Add your bot" section shows plain text with no link.
window.LAUNCH_POST_URL = "https://x.com/Phil_Holland/status/2114041706366812371";

// Feedback links (results row and footer). FEEDBACK_X lists the X handles the prefilled post tags, without the @. FEEDBACK_ISSUES is where "Bug? Open an issue" goes.
window.FEEDBACK_X = ["thecsguy", "Phil_Holland"];
window.FEEDBACK_ISSUES = "https://github.com/PhillipHolland/grokbotshelf/issues/new";

// "From the builders" strip on the home Featured view. Names must match bots.json exactly.
// Phil's first two lead (Coach, Security Audit Bot), then a mix with Nick's. Shelfer stays out of this strip.
window.BUILDERS = {
  handles: ["@Phil_Holland", "@thecsguy"],
  feature: ["Coach", "Security Audit Bot", "Disk Doctor", "Claude Remote", "Vuln Scout", "Archivist", "Package Pal", "Afterglow"],
};

// Shelfer: the Grok Bot template that queues a bot for the shelf. Used by the hero "Get Shelfer" link and the Add your bot copy.
window.SHELFER_URL = "https://x.ai/bot/BYaLwjYHrWUAcUlyZVbgP";
