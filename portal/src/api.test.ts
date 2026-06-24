import { afterEach, describe, expect, it, vi } from 'vitest';

import { getDashboard, normalizeApiBaseUrl } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('portal API', () => {
  it('normalizes configured API URLs', () => {
    expect(normalizeApiBaseUrl('https://api.example.com/')).toBe(
      'https://api.example.com',
    );
    expect(() => normalizeApiBaseUrl('file:///api')).toThrow();
  });

  it('sends the Supabase access token as bearer authentication', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ advertiser: {}, ads: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getDashboard('access-token');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/advertiser/dashboard',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });
});
