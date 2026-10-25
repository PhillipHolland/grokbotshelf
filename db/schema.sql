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

-- Suggested bots from the #add form (POST /api/submit). Never published automatically:
-- a person reviews pending rows and adds approved ones to public/bots.json by hand.
-- api/submit.js also creates these tables on first use, so this file stays the reference.
CREATE TABLE IF NOT EXISTS submissions (
  id             BIGSERIAL   PRIMARY KEY,
  template_id    TEXT,
  bot_url        TEXT,
  post_id        TEXT,
  post_url       TEXT,
  title          TEXT,
  description    TEXT,
  post_author    TEXT,
  post_text      TEXT,
  note           TEXT,
  status         TEXT        NOT NULL DEFAULT 'pending',
  ip_hash        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS submissions_template ON submissions (template_id) WHERE template_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS submissions_post ON submissions (post_id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS submissions_status ON submissions (status, created_at);

-- Every submit attempt (accepted or not) for rate limiting. Pruned by the API.
CREATE TABLE IF NOT EXISTS submit_events (
  ip_hash TEXT        NOT NULL,
  at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS submit_events_ip_at ON submit_events (ip_hash, at);
