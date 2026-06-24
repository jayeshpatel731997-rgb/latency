export interface Ad {
  id: string;
  text: string;
  url: string;
  advertiserId: string;
  cpmInr: number;
}

export type InstallationRegistration = {
  installationId: string;
  token: string;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function normalizeApiBaseUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Latency API URL must use HTTP or HTTPS');
  }
  return url.toString().replace(/\/$/, '');
}

async function requestJson<T>(
  apiBaseUrl: string,
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(`${normalizeApiBaseUrl(apiBaseUrl)}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(
        response.status,
        typeof payload.error === 'string' ? payload.error : 'request_failed',
      );
    }
    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function registerInstallation(
  apiBaseUrl: string,
): Promise<InstallationRegistration> {
  return requestJson(apiBaseUrl, '/api/installations', { method: 'POST' });
}

export async function fetchAd(
  apiBaseUrl: string,
  token: string,
): Promise<Ad | null> {
  try {
    return await requestJson<Ad>(apiBaseUrl, '/api/ad', {}, token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function reportImpression(
  apiBaseUrl: string,
  token: string,
  impressionId: string,
  adId: string,
  durationMs: number,
): Promise<void> {
  await requestJson(
    apiBaseUrl,
    '/api/impression',
    {
      method: 'POST',
      body: JSON.stringify({ impressionId, adId, durationMs }),
    },
    token,
  );
}

export async function reportClick(
  apiBaseUrl: string,
  token: string,
  impressionId: string,
): Promise<void> {
  await requestJson(
    apiBaseUrl,
    '/api/click',
    { method: 'POST', body: JSON.stringify({ impressionId }) },
    token,
  );
}

export async function fetchWalletBalance(
  apiBaseUrl: string,
  token: string,
): Promise<number> {
  const wallet = await requestJson<{ balancePaise: number }>(
    apiBaseUrl,
    '/api/wallet',
    {},
    token,
  );
  return wallet.balancePaise;
}
