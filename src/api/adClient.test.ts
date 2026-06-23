import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  fetchWalletBalance,
  normalizeApiBaseUrl,
} from './adClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeApiBaseUrl', () => {
  it('removes a trailing slash', () => {
    expect(normalizeApiBaseUrl('https://api.example.com/')).toBe(
      'https://api.example.com',
    );
  });

  it('rejects non-http protocols', () => {
    expect(() => normalizeApiBaseUrl('file:///tmp/api')).toThrow();
  });
});

it('authenticates wallet requests and parses the balance', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ balancePaise: 42 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);

  await expect(fetchWalletBalance('https://api.example.com', 'token')).resolves.toBe(42);
  expect(fetchMock).toHaveBeenCalledWith(
    'https://api.example.com/api/wallet',
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
    }),
  );
});

it('reports API errors without leaking response bodies', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_installation_token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );

  await expect(fetchWalletBalance('https://api.example.com', 'bad')).rejects.toEqual(
    expect.objectContaining<ApiError>({
      status: 401,
      message: 'invalid_installation_token',
    }),
  );
});
