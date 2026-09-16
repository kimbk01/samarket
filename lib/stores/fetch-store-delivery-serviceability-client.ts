/**
 * Client fetch for store detail / cart — same SSOT as GET …/delivery-serviceability.
 * No Google; server evaluates haversine + effective policy.
 *
 * Request identity = store slug only (server resolves master address + policy).
 * Identical slug → single-flight + short TTL reuse; address updates invalidate.
 */
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/lib/addresses/addresses-updated-event";
import {
  forgetSingleFlight,
  forgetSingleFlightsWhere,
  runSingleFlight,
} from "@/lib/http/run-single-flight";

export type StoreDeliveryServiceabilityClientPayload = {
  ok: boolean;
  eligible?: boolean;
  applies?: boolean;
  reason?: string;
  distanceKm?: number | null;
  maxKm?: number | null;
  policyEnabled?: boolean;
  error?: string;
};

/** Navigation-burst reuse only — not a permanent eligibility cache. */
export const STORE_DELIVERY_SERVICEABILITY_CLIENT_TTL_MS = 5_000;
const FLIGHT_PREFIX = "stores:delivery-serviceability:" as const;

type CachedOk = {
  expiresAt: number;
  value: StoreDeliveryServiceabilityClientPayload;
};

const resultBySlug = new Map<string, CachedOk>();

function normalizeSlug(slug: string): string {
  return String(slug || "").trim();
}

function flightKey(slug: string): string {
  return `${FLIGHT_PREFIX}${slug}`;
}

/** Drop memoized OK payloads and in-flight work (one slug or all). */
export function invalidateStoreDeliveryServiceabilityClientCache(slug?: string): void {
  const s = slug != null ? normalizeSlug(slug) : "";
  if (s) {
    resultBySlug.delete(s);
    forgetSingleFlight(flightKey(s));
    return;
  }
  resultBySlug.clear();
  forgetSingleFlightsWhere((k) => k.startsWith(FLIGHT_PREFIX));
}

/** @internal vitest */
export function __resetStoreDeliveryServiceabilityClientForTests(): void {
  resultBySlug.clear();
  forgetSingleFlightsWhere((k) => k.startsWith(FLIGHT_PREFIX));
}

function rememberOk(slug: string, value: StoreDeliveryServiceabilityClientPayload): void {
  if (value.ok !== true) return;
  resultBySlug.set(slug, {
    value,
    expiresAt: Date.now() + STORE_DELIVERY_SERVICEABILITY_CLIENT_TTL_MS,
  });
}

function peekOk(slug: string): StoreDeliveryServiceabilityClientPayload | null {
  const hit = resultBySlug.get(slug);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    resultBySlug.delete(slug);
    return null;
  }
  return hit.value;
}

async function networkFetch(slug: string): Promise<StoreDeliveryServiceabilityClientPayload> {
  const res = await fetch(`/api/stores/${encodeURIComponent(slug)}/delivery-serviceability`, {
    cache: "no-store",
    credentials: "same-origin",
    // Caller AbortSignal is not attached: effect cleanup must not cancel shared flight.
  });
  const j = (await res.json().catch(() => ({}))) as StoreDeliveryServiceabilityClientPayload;
  if (!res.ok) {
    return { ok: false, error: typeof j.error === "string" ? j.error : `http_${res.status}` };
  }
  return j?.ok === true ? j : { ok: false, error: j.error || "bad_response" };
}

export async function fetchStoreDeliveryServiceabilityClient(
  slug: string,
  signal?: AbortSignal
): Promise<StoreDeliveryServiceabilityClientPayload> {
  const s = normalizeSlug(slug);
  if (!s) return { ok: false, error: "missing_slug" };

  if (signal?.aborted) {
    return { ok: false, error: "aborted" };
  }

  const cached = peekOk(s);
  if (cached) return cached;

  const payload = await runSingleFlight(flightKey(s), async () => {
    const again = peekOk(s);
    if (again) return again;
    const value = await networkFetch(s);
    rememberOk(s, value);
    return value;
  });

  if (signal?.aborted) {
    return { ok: false, error: "aborted" };
  }
  return payload;
}

/** True when distance policy applies and this store is not deliverable to current address. */
export function isDeliveryDistanceOrderBlocked(
  svc: StoreDeliveryServiceabilityClientPayload | null
): boolean {
  if (!svc || svc.ok !== true) return false;
  return svc.applies === true && svc.eligible !== true;
}

function onAddressesUpdated(): void {
  invalidateStoreDeliveryServiceabilityClientCache();
}

let addressListenerBound = false;
function bindAddressInvalidationListener(): void {
  if (addressListenerBound || typeof window === "undefined") return;
  addressListenerBound = true;
  window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
}

bindAddressInvalidationListener();
