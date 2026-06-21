CREATE OR REPLACE FUNCTION public.record_ad_impression(
  p_impression_id TEXT,
  p_ad_id UUID,
  p_user_id TEXT,
  p_duration_ms INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  advertiser_uuid UUID;
  ad_cpm_inr INTEGER;
  advertiser_wallet_paise INTEGER;
  impression_cost_paise INTEGER;
  user_credit_paise INTEGER;
  inserted_impression_id TEXT;
  existing_impression impressions%ROWTYPE;
BEGIN
  IF NULLIF(BTRIM(p_impression_id), '') IS NULL THEN
    RAISE EXCEPTION 'Impression ID is required' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(BTRIM(p_user_id), '') IS NULL THEN
    RAISE EXCEPTION 'User ID is required' USING ERRCODE = '22023';
  END IF;

  IF p_duration_ms IS NULL OR p_duration_ms < 0 THEN
    RAISE EXCEPTION 'Duration must be non-negative' USING ERRCODE = '22023';
  END IF;

  INSERT INTO users (id, balance_paise, total_earned_paise)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (id) DO NOTHING;

  PERFORM 1
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  SELECT ads.advertiser_id, ads.cpm_inr, advertisers.wallet_paise
  INTO advertiser_uuid, ad_cpm_inr, advertiser_wallet_paise
  FROM ads
  INNER JOIN advertisers ON advertisers.id = ads.advertiser_id
  WHERE ads.id = p_ad_id
  FOR UPDATE OF advertisers;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ad % was not found', p_ad_id USING ERRCODE = 'P0002';
  END IF;

  impression_cost_paise := ROUND((ad_cpm_inr::NUMERIC * 100) / 1000)::INTEGER;
  user_credit_paise := ROUND(impression_cost_paise::NUMERIC * 0.5)::INTEGER;

  INSERT INTO impressions (
    id,
    ad_id,
    user_id,
    duration_ms,
    paid,
    cpm_inr
  )
  VALUES (
    p_impression_id,
    p_ad_id,
    p_user_id,
    p_duration_ms,
    TRUE,
    ad_cpm_inr
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO inserted_impression_id;

  IF inserted_impression_id IS NULL THEN
    SELECT *
    INTO existing_impression
    FROM impressions
    WHERE id = p_impression_id;

    IF existing_impression.ad_id IS DISTINCT FROM p_ad_id
      OR existing_impression.user_id IS DISTINCT FROM p_user_id
      OR existing_impression.duration_ms IS DISTINCT FROM p_duration_ms THEN
      RAISE EXCEPTION 'Impression ID % already has different data', p_impression_id
        USING ERRCODE = '23505';
    END IF;

    impression_cost_paise :=
      ROUND((existing_impression.cpm_inr::NUMERIC * 100) / 1000)::INTEGER;
    user_credit_paise := ROUND(impression_cost_paise::NUMERIC * 0.5)::INTEGER;

    RETURN jsonb_build_object(
      'recorded', FALSE,
      'cpmInr', existing_impression.cpm_inr,
      'impressionCostPaise', impression_cost_paise,
      'userCreditPaise', user_credit_paise
    );
  END IF;

  IF advertiser_wallet_paise < impression_cost_paise THEN
    RAISE EXCEPTION 'Advertiser wallet has insufficient funds'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE advertisers
  SET wallet_paise = wallet_paise - impression_cost_paise
  WHERE id = advertiser_uuid;

  UPDATE users
  SET
    balance_paise = balance_paise + user_credit_paise,
    total_earned_paise = total_earned_paise + user_credit_paise
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'recorded', TRUE,
    'cpmInr', ad_cpm_inr,
    'impressionCostPaise', impression_cost_paise,
    'userCreditPaise', user_credit_paise
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_ad_impression(TEXT, UUID, TEXT, INTEGER)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_ad_impression(TEXT, UUID, TEXT, INTEGER)
  TO service_role;
