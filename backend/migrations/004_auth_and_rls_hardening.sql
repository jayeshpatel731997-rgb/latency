ALTER TABLE advertisers
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS advertisers_user_id_idx
  ON advertisers (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ads_advertiser_id_idx
  ON ads (advertiser_id);

CREATE INDEX IF NOT EXISTS impressions_ad_id_idx
  ON impressions (ad_id);

CREATE TABLE IF NOT EXISTS installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT UNIQUE NOT NULL CHECK (char_length(token_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE installations IS
  'Stores hashed credentials for authenticated VS Code extension installations.';

ALTER TABLE advertisers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE advertiser_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE installations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE advertisers FROM anon, authenticated;
REVOKE ALL ON TABLE ads FROM anon, authenticated;
REVOKE ALL ON TABLE users FROM anon, authenticated;
REVOKE ALL ON TABLE impressions FROM anon, authenticated;
REVOKE ALL ON TABLE advertiser_payments FROM anon, authenticated;
REVOKE ALL ON TABLE installations FROM anon, authenticated;

GRANT ALL ON TABLE advertisers TO service_role;
GRANT ALL ON TABLE ads TO service_role;
GRANT ALL ON TABLE users TO service_role;
GRANT ALL ON TABLE impressions TO service_role;
GRANT ALL ON TABLE advertiser_payments TO service_role;
GRANT ALL ON TABLE installations TO service_role;

REVOKE EXECUTE ON FUNCTION public.credit_advertiser_wallet(TEXT, INTEGER, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_advertiser_wallet(TEXT, INTEGER, TEXT, TEXT)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_ad_impression(TEXT, UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_impression(TEXT, UUID, TEXT, INTEGER)
  TO service_role;
