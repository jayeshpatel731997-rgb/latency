export interface Ad {
  id: string;
  text: string;
  url: string;
  advertiserId: string;
  cpmInr: number;
}

/**
 * Fetches an ad for a user, returning null when the request cannot complete.
 */
export async function fetchAd(userId: string): Promise<Ad | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    const response = await fetch(
      `http://localhost:3001/api/ad?userId=${encodeURIComponent(userId)}`,
      { method: "GET", signal: controller.signal },
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as Ad;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Reports a viewed ad impression without propagating request failures.
 */
export async function reportImpression(
  impressionId: string,
  adId: string,
  userId: string,
  durationMs: number,
): Promise<void> {
  void fetch("http://localhost:3001/api/impression", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ impressionId, adId, userId, durationMs }),
  }).catch(() => undefined);
}

/**
 * Reports an ad click without propagating request failures.
 */
export async function reportClick(
  impressionId: string,
  userId: string,
): Promise<void> {
  void fetch("http://localhost:3001/api/click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ impressionId, userId }),
  }).catch(() => undefined);
}
