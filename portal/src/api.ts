export type Ad = {
  id: string;
  text: string;
  url: string;
  cpmInr: number;
  active: boolean;
  impressions: number;
  clicks: number;
};

export type Dashboard = {
  advertiser: {
    email: string;
    walletPaise: number;
  };
  ads: Ad[];
};

export function normalizeApiBaseUrl(value: string): string {
  if (!value) {
    return '';
  }
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('VITE_API_BASE_URL must use HTTP or HTTPS');
  }
  return url.toString().replace(/\/$/, '');
}

const apiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL ?? '');

async function request<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? 'request_failed');
  }
  return payload as T;
}

export function getDashboard(accessToken: string): Promise<Dashboard> {
  return request('/api/advertiser/dashboard', accessToken);
}

export function createAd(
  accessToken: string,
  data: { text: string; url: string; cpmInr: number },
): Promise<Ad> {
  return request('/api/advertiser/ads', accessToken, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
