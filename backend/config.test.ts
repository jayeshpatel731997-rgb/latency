import { describe, expect, it } from 'vitest';

import { loadConfig } from './config';

const validEnv = {
  APP_ENV: 'staging',
  PORT: '3001',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'publishable',
  SUPABASE_SECRET_KEY: 'secret',
};

describe('loadConfig', () => {
  it('accepts current Supabase key names', () => {
    expect(loadConfig(validEnv).supabaseSecretKey).toBe('secret');
  });

  it('requires a server-only Supabase key', () => {
    expect(() => loadConfig({ ...validEnv, SUPABASE_SECRET_KEY: '' })).toThrow(
      /SUPABASE_SECRET_KEY/,
    );
  });

  it('only enables staging credits in staging', () => {
    expect(loadConfig({
      ...validEnv,
      STAGING_INITIAL_WALLET_PAISE: '500',
    }).stagingInitialWalletPaise).toBe(500);
    expect(loadConfig({
      ...validEnv,
      APP_ENV: 'production',
      STAGING_INITIAL_WALLET_PAISE: '500',
    }).stagingInitialWalletPaise).toBe(0);
  });
});
