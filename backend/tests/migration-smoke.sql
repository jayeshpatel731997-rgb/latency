BEGIN;

INSERT INTO auth.users (id)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

INSERT INTO advertisers (id, user_id, email, wallet_paise)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'smoke@example.com',
  100
);

INSERT INTO ads (id, advertiser_id, text, url, cpm_inr)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'Smoke ad',
  'https://example.com',
  50
);

INSERT INTO installations (id, token_hash)
VALUES (
  '33333333-3333-4333-8333-333333333333',
  repeat('a', 64)
);

SET LOCAL ROLE service_role;
SELECT public.record_ad_impression(
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  3000
);
SELECT public.record_ad_impression(
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  3000
);
RESET ROLE;

DO $test$
DECLARE
  wallet INTEGER;
  balance INTEGER;
  impression_count INTEGER;
  paid BOOLEAN;
BEGIN
  SELECT wallet_paise INTO wallet
  FROM advertisers
  WHERE id = '11111111-1111-4111-8111-111111111111';

  SELECT balance_paise INTO balance
  FROM users
  WHERE id = '33333333-3333-4333-8333-333333333333';

  SELECT count(*), bool_and(impressions.paid)
  INTO impression_count, paid
  FROM impressions
  WHERE id = '44444444-4444-4444-8444-444444444444';

  IF wallet <> 95 OR balance <> 3 OR impression_count <> 1 OR NOT paid THEN
    RAISE EXCEPTION 'Atomic accounting assertion failed';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.record_ad_impression(text,uuid,text,integer)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.record_ad_impression(text,uuid,text,integer)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.record_ad_impression(text,uuid,text,integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Accounting function ACL assertion failed';
  END IF;
END
$test$;

ROLLBACK;
