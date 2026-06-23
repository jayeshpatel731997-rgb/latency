export type AppEnvironment = 'development' | 'test' | 'staging' | 'production';

export type AppConfig = {
  appEnvironment: AppEnvironment;
  host: string;
  port: number;
  allowedOrigins: string[];
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseSecretKey: string;
  stagingInitialWalletPaise: number;
};

function required(
  env: NodeJS.ProcessEnv,
  names: string[],
): string {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required environment variable: ${names.join(' or ')}`);
}

function nonNegativeInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative integer, received: ${value}`);
  }

  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const appEnvironment = (env.APP_ENV ?? env.NODE_ENV ?? 'development') as AppEnvironment;
  if (!['development', 'test', 'staging', 'production'].includes(appEnvironment)) {
    throw new Error(`Invalid APP_ENV: ${appEnvironment}`);
  }

  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }

  const defaultOrigins = appEnvironment === 'development'
    ? ['http://localhost:5173', 'http://127.0.0.1:5173']
    : [];
  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean)
    : defaultOrigins;

  return {
    appEnvironment,
    host: env.HOST?.trim() || '0.0.0.0',
    port,
    allowedOrigins,
    supabaseUrl: required(env, ['SUPABASE_URL']),
    supabasePublishableKey: required(env, [
      'SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_ANON_KEY',
    ]),
    supabaseSecretKey: required(env, [
      'SUPABASE_SECRET_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
    ]),
    stagingInitialWalletPaise: appEnvironment === 'staging'
      ? nonNegativeInteger(env.STAGING_INITIAL_WALLET_PAISE, 0)
      : 0,
  };
}
