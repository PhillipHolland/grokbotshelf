-- Grok Bot Shelf votes. Run once against Neon (idempotent):
--   psql "$DATABASE_URL_UNPOOLED" -f db/schema.sql
-- bot_slug matches the card id in app.js ("bot-" + slugified name).
-- voter_key is a random UUID kept in an httpOnly cookie (gbs_vid), never an IP.
-- ip_hash is a salted SHA-256 of the client IP, used only for burst rate limiting.

CREATE TABLE IF NOT EXISTS votes (
  bot_slug   TEXT        NOT NULL,
  voter_key  TEXT        NOT NULL,
  value      SMALLINT    NOT NULL CHECK (value IN (-1, 1)),
  ip_hash    TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bot_slug, voter_key)
);

CREATE INDEX IF NOT EXISTS votes_ip_recent ON votes (ip_hash, updated_at);

-- Rolling log of vote writes (including clears) for rate limiting. Old rows are pruned by the API.
CREATE TABLE IF NOT EXISTS vote_events (
  ip_hash    TEXT        NOT NULL,
  voter_key  TEXT        NOT NULL,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vote_events_ip_at ON vote_events (ip_hash, at);
CREATE INDEX IF NOT EXISTS vote_events_voter_at ON vote_events (voter_key, at);

CREATE OR REPLACE VIEW vote_totals AS
SELECT bot_slug,
       COUNT(*) FILTER (WHERE value = 1)::int  AS up,
       COUNT(*) FILTER (WHERE value = -1)::int AS down,
       COALESCE(SUM(value), 0)::int            AS score
FROM votes
GROUP BY bot_slug;
