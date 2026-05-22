import { runSingleFlight } from "@/lib/http/run-single-flight";

const CHECKOUT_CONTACT_TTL_MS = 45_000;

type CheckoutContactCacheRow = {
  expiresAt: number;
  status: number;
  json: unknown;
};

let memoryCache: CheckoutContactCacheRow | null = null;

export type MeCheckoutContactResponse = {
  status: number;
  json: unknown;
};

export function peekMeCheckoutContactCached(): MeCheckoutContactResponse | null {
  if (!memoryCache || memoryCache.expiresAt <= Date.now()) {
    if (memoryCache) memoryCache = null;
    return null;
  }
  return { status: memoryCache.status, json: memoryCache.json };
}

export function primeMeCheckoutContactCache(res: MeCheckoutContactResponse): void {
  if (res.status < 200 || res.status >= 300) return;
  const j = res.json as { ok?: boolean };
  if (!j?.ok) return;
  memoryCache = {
    expiresAt: Date.now() + CHECKOUT_CONTACT_TTL_MS,
    status: res.status,
    json: res.json,
  };
}

/** GET /api/me/checkout-contact — 45s memory + singleflight */
export async function fetchMeCheckoutContactDeduped(): Promise<MeCheckoutContactResponse> {
  const hit = peekMeCheckoutContactCached();
  if (hit) return hit;

  return runSingleFlight("me:checkout-contact:get", async () => {
    const again = peekMeCheckoutContactCached();
    if (again) return again;

    const res = await fetch("/api/me/checkout-contact", {
      credentials: "include",
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    const value = { status: res.status, json };
    primeMeCheckoutContactCache(value);
    return value;
  });
}

export function clearMeCheckoutContactCacheForTests(): void {
  memoryCache = null;
}
