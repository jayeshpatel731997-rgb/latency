CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS advertisers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  wallet_paise INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE advertisers IS
  'Stores advertiser accounts and their prepaid wallet balances.';

CREATE TABLE IF NOT EXISTS ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID REFERENCES advertisers(id),
  text TEXT NOT NULL CHECK (char_length(text) <= 100),
  url TEXT NOT NULL,
  cpm_inr INTEGER NOT NULL DEFAULT 50,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE ads IS
  'Stores advertisements, auction bids, and active delivery status.';

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  balance_paise INTEGER NOT NULL DEFAULT 0,
  total_earned_paise INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE users IS
  'Stores pseudonymous users and their current and lifetime earnings.';

CREATE TABLE IF NOT EXISTS impressions (
  id TEXT PRIMARY KEY,
  ad_id UUID REFERENCES ads(id),
  user_id TEXT REFERENCES users(id),
  shown_at TIMESTAMPTZ DEFAULT now(),
  duration_ms INTEGER,
  clicked BOOLEAN NOT NULL DEFAULT false,
  paid BOOLEAN NOT NULL DEFAULT false,
  cpm_inr INTEGER NOT NULL
);

COMMENT ON TABLE impressions IS
  'Records ad impressions, engagement, and payout processing state.';

CREATE INDEX IF NOT EXISTS ads_active_cpm_inr_idx
  ON ads (active, cpm_inr DESC);

CREATE INDEX IF NOT EXISTS impressions_user_id_idx
  ON impressions (user_id);

CREATE INDEX IF NOT EXISTS impressions_paid_idx
  ON impressions (paid);
