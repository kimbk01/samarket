/**
 * Client fetch for store detail / cart — same SSOT as GET …/delivery-serviceability.
 * No Google; server evaluates haversine + effective policy.
 *
 * Request identity = store slug (server resolves master address + policy from the session).
 * Cache key = slug + viewer user id (guest ≠ member) — server result depends on the viewer.
 * Identical key → single-flight + short TTL reuse; address updates · auth changes invalidate.
 */
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/lib/addresses/addresses-updated-event";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { forgetSingleFlightsWhere, runSingleFlight } from "@/lib/http/run-single-flight";
import type { MessageKey } from "@/lib/i18n/messages";

export type StoreDeliveryServiceabilityClientPayload = {
  ok: boolean;
  eligible?: boolean;
  applies?: boolean;
  reason?: string;
  distanceKm?: number | null;
  maxKm?: number | null;
  policyEnabled?: boolean;
  /** Server-resolved master address the result was evaluated for (null = guest / no master). */
  addressId?: string | null;
  error?: string;
};

export type StoreDeliveryServiceabilityViewerOpts = {
  /** Current auth user id; null/empty = guest. Part of the cache key. */
  viewerUserId?: string | null;
};

/** Navigation-burst reuse only — not a permanent eligibility cache. */
export const STORE_DELIVERY_SERVICEABILITY_CLIENT_TTL_MS = 5_000;
const FLIGHT_PREFIX = "stores:delivery-serviceability:" as const;

type CachedOk = {
  expiresAt: number;
  value: StoreDeliveryServiceabilityClientPayload;
};

const resultByKey = new Map<string, CachedOk>();

function normalizeSlug(slug: string): string {
  return String(slug || "").trim();
}

/** `slug|viewer` — viewer `_` = guest. */
export function storeDeliveryServiceabilityClientCacheKey(
  slug: string,
  viewerUserId?: string | null
): string {
  const viewer = String(viewerUserId ?? "").trim() || "_";
  return `${normalizeSlug(slug)}|${viewer}`;
}

function slugOfKey(key: string): string {
  const i = key.lastIndexOf("|");
  return i >= 0 ? key.slice(0, i) : key;
}

function flightKey(key: string): string {
  return `${FLIGHT_PREFIX}${key}`;
}

/** Drop memoized OK payloads and in-flight work (one slug — every viewer — or all). */
export function invalidateStoreDeliveryServiceabilityClientCache(slug?: string): void {
  const s = slug != null ? normalizeSlug(slug) : "";
  if (s) {
    for (const k of [...resultByKey.keys()]) {
      if (slugOfKey(k) === s) resultByKey.delete(k);
    }
    forgetSingleFlightsWhere(
      (k) => k.startsWith(FLIGHT_PREFIX) && slugOfKey(k.slice(FLIGHT_PREFIX.length)) === s
    );
    return;
  }
  resultByKey.clear();
  forgetSingleFlightsWhere((k) => k.startsWith(FLIGHT_PREFIX));
}

/** @internal vitest */
export function __resetStoreDeliveryServiceabilityClientForTests(): void {
  resultByKey.clear();
  forgetSingleFlightsWhere((k) => k.startsWith(FLIGHT_PREFIX));
}

function rememberOk(key: string, value: StoreDeliveryServiceabilityClientPayload): void {
  if (value.ok !== true) return;
  resultByKey.set(key, {
    value,
    expiresAt: Date.now() + STORE_DELIVERY_SERVICEABILITY_CLIENT_TTL_MS,
  });
}

function peekOk(key: string): StoreDeliveryServiceabilityClientPayload | null {
  const hit = resultByKey.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    resultByKey.delete(key);
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
  signal?: AbortSignal,
  opts?: StoreDeliveryServiceabilityViewerOpts
): Promise<StoreDeliveryServiceabilityClientPayload> {
  const s = normalizeSlug(slug);
  if (!s) return { ok: false, error: "missing_slug" };

  if (signal?.aborted) {
    return { ok: false, error: "aborted" };
  }

  const key = storeDeliveryServiceabilityClientCacheKey(s, opts?.viewerUserId);
  const cached = peekOk(key);
  if (cached) return cached;

  const payload = await runSingleFlight(flightKey(key), async () => {
    const again = peekOk(key);
    if (again) return again;
    const value = await networkFetch(s);
    rememberOk(key, value);
    return value;
  });

  if (signal?.aborted) {
    return { ok: false, error: "aborted" };
  }
  return payload;
}

/** True when distance policy applies and this store is outside the member delivery area. */
export function isDeliveryDistanceOrderBlocked(
  svc: StoreDeliveryServiceabilityClientPayload | null,
  opts?: { viewerIsGuest?: boolean }
): boolean {
  if (!svc || svc.ok !== true) return false;
  if (svc.applies !== true || svc.eligible === true) return false;
  /**
   * LOC-010: member whose master address has no routable coords (incl. 0,0) is blocked here too —
   * checkout returns `delivery_customer_coords_required` for the same address.
   * Guest has no master → not blocked in UI (ordering still requires login + address).
   */
  if (svc.reason === "missing_customer_coords" && opts?.viewerIsGuest === true) return false;
  /**
   * V2 guest has no member LGU — same as list policy (guest never OOR in UI).
   * Members keep fail-closed; server still blocks at checkout either way.
   */
  if (svc.reason === "missing_lgu_identity" && opts?.viewerIsGuest === true) return false;
  return true;
}

/**
 * LOC-010 — cart block copy by serviceability reason (same reason codes as checkout 400).
 * `bodyKey` = the checkout error copy for the same reason, so pre-check and final check agree.
 */
export function resolveDeliveryDistanceBlockCopyKeys(reason: string | null | undefined): {
  titleKey: MessageKey;
  bodyKey: MessageKey;
  inlineKey: MessageKey;
} {
  switch (reason) {
    case "missing_customer_coords":
      return {
        titleKey: "store_delivery_routable_repair_title",
        bodyKey: "store_err_delivery_customer_coords_required",
        inlineKey: "store_err_delivery_customer_coords_required",
      };
    case "missing_store_coords":
      return {
        titleKey: "store_cart_delivery_unavailable_title",
        bodyKey: "store_err_delivery_store_coords_required",
        inlineKey: "store_err_delivery_store_coords_required",
      };
    case "missing_lgu_identity":
      return {
        titleKey: "store_delivery_routable_repair_title",
        bodyKey: "store_err_delivery_customer_lgu_unresolved",
        inlineKey: "store_err_delivery_customer_lgu_unresolved",
      };
    default:
      return {
        titleKey: "store_cart_delivery_unavailable_title",
        bodyKey: "store_cart_delivery_unavailable_body",
        inlineKey: "store_err_delivery_out_of_range",
      };
  }
}

function onAddressesUpdated(): void {
  invalidateStoreDeliveryServiceabilityClientCache();
}

function onAuthChanged(): void {
  invalidateStoreDeliveryServiceabilityClientCache();
}

let addressListenerBound = false;
function bindAddressInvalidationListener(): void {
  if (addressListenerBound || typeof window === "undefined") return;
  addressListenerBound = true;
  window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuthChanged);
}

bindAddressInvalidationListener();
