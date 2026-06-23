import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createClient, User } from '@supabase/supabase-js';

import { AppConfig } from './config';

export type AdvertiserUser = {
  id: string;
  email: string;
};

export type InstallationCredentials = {
  installationId: string;
  token: string;
  tokenHash: string;
};

export function createInstallationCredentials(): InstallationCredentials {
  const token = randomBytes(32).toString('base64url');
  return {
    installationId: randomUUID(),
    token,
    tokenHash: hashInstallationToken(token),
  };
}

export function hashInstallationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function toAdvertiserUser(user: User | null): AdvertiserUser | null {
  if (!user?.email) {
    return null;
  }

  return { id: user.id, email: user.email };
}

export function createAccessTokenVerifier(config: AppConfig) {
  const authClient = createClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  return async (accessToken: string): Promise<AdvertiserUser | null> => {
    const { data, error } = await authClient.auth.getUser(accessToken);
    if (error) {
      return null;
    }

    return toAdvertiserUser(data.user);
  };
}
