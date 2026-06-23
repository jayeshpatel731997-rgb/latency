import { describe, expect, it } from 'vitest';

import {
  createInstallationCredentials,
  hashInstallationToken,
} from './auth';

describe('installation credentials', () => {
  it('stores only a deterministic hash of a random token', () => {
    const credentials = createInstallationCredentials();
    expect(credentials.installationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(credentials.token).not.toBe(credentials.tokenHash);
    expect(credentials.tokenHash).toBe(hashInstallationToken(credentials.token));
    expect(credentials.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
