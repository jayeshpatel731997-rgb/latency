CREATE TABLE IF NOT EXISTS advertiser_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID NOT NULL REFERENCES advertisers(id),
  razorpay_order_id TEXT NOT NULL,
  razorpay_payment_id TEXT UNIQUE NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 50000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE advertiser_payments IS
  'Records verified Razorpay wallet deposits and prevents duplicate credits.';

CREATE INDEX IF NOT EXISTS advertiser_payments_advertiser_id_idx
  ON advertiser_payments (advertiser_id);

CREATE OR REPLACE FUNCTION credit_advertiser_wallet(
  p_email TEXT,
  p_amount_paise INTEGER,
  p_razorpay_order_id TEXT,
  p_razorpay_payment_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  advertiser_uuid UUID;
  updated_balance INTEGER;
BEGIN
  IF p_amount_paise < 50000 THEN
    RAISE EXCEPTION 'Minimum wallet funding amount is 50000 paise';
  END IF;

  INSERT INTO advertisers (email)
  VALUES (p_email)
  ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
  RETURNING id INTO advertiser_uuid;

  INSERT INTO advertiser_payments (
    advertiser_id,
    razorpay_order_id,
    razorpay_payment_id,
    amount_paise
  )
  VALUES (
    advertiser_uuid,
    p_razorpay_order_id,
    p_razorpay_payment_id,
    p_amount_paise
  );

  UPDATE advertisers
  SET wallet_paise = wallet_paise + p_amount_paise
  WHERE id = advertiser_uuid
  RETURNING wallet_paise INTO updated_balance;

  RETURN updated_balance;
END;
$$;
