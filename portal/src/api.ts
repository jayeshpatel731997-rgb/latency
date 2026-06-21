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

type RazorpayOrder = {
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
};

export type RazorpaySuccess = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

async function request<T>(
  path: string,
  password: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-advertiser-password': password,
      ...init?.headers,
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error ?? 'request_failed');
  }

  return payload as T;
}

export function getDashboard(password: string): Promise<Dashboard> {
  return request('/api/advertiser/dashboard', password);
}

export function createAd(
  password: string,
  data: { text: string; url: string; cpmInr: number },
): Promise<Ad> {
  return request('/api/advertiser/ads', password, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function createFundingOrder(
  password: string,
  amountInr: number,
): Promise<RazorpayOrder> {
  return request('/api/advertiser/fund/order', password, {
    method: 'POST',
    body: JSON.stringify({ amountInr }),
  });
}

export function verifyFunding(
  password: string,
  payment: RazorpaySuccess,
): Promise<{ ok: true; walletPaise: number }> {
  return request('/api/advertiser/fund/verify', password, {
    method: 'POST',
    body: JSON.stringify({
      razorpayOrderId: payment.razorpay_order_id,
      razorpayPaymentId: payment.razorpay_payment_id,
      razorpaySignature: payment.razorpay_signature,
    }),
  });
}
