import { describe, expect, it, vi } from 'vitest';

import { getOrCreateInstallationIdentity } from './identity';

function stores() {
  const state = new Map<string, unknown>();
  const secrets = new Map<string, string>();
  return {
    globalState: {
      get: <T>(key: string) => state.get(key) as T | undefined,
      update: async (key: string, value: unknown) => {
        state.set(key, value);
      },
    },
    secretStorage: {
      get: async (key: string) => secrets.get(key),
      store: async (key: string, value: string) => {
        secrets.set(key, value);
      },
    },
  };
}

describe('installation identity', () => {
  it('registers once and reuses the secret for the same API', async () => {
    const storage = stores();
    const register = vi.fn().mockResolvedValue({
      installationId: 'installation-id',
      token: 'installation-token',
    });

    const first = await getOrCreateInstallationIdentity(
      'https://api.example.com',
      storage.globalState as never,
      storage.secretStorage as never,
      register,
    );
    const second = await getOrCreateInstallationIdentity(
      'https://api.example.com',
      storage.globalState as never,
      storage.secretStorage as never,
      register,
    );

    expect(first).toEqual(second);
    expect(register).toHaveBeenCalledOnce();
  });

  it('registers again when the API changes', async () => {
    const storage = stores();
    const register = vi
      .fn()
      .mockResolvedValueOnce({ installationId: 'one', token: 'token-one' })
      .mockResolvedValueOnce({ installationId: 'two', token: 'token-two' });

    await getOrCreateInstallationIdentity(
      'https://one.example.com',
      storage.globalState as never,
      storage.secretStorage as never,
      register,
    );
    const identity = await getOrCreateInstallationIdentity(
      'https://two.example.com',
      storage.globalState as never,
      storage.secretStorage as never,
      register,
    );

    expect(identity.installationId).toBe('two');
    expect(register).toHaveBeenCalledTimes(2);
  });
});
