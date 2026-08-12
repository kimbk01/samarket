/**
 * OWNER ACTIVE STORE AUTHORITY (MODEL A) — single runtime store identity.
 *
 * Priority:
 *   1. valid ?storeId= (owned by list)
 *   2. OwnerLite / session preferred
 *   3. newest approved + visible + sellable (pickPreferredOwnerStore)
 *
 * DO NOT: let Bell / FAB / Header Ops / CTA re-pick newest independently.
 */
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { pickPreferredOwnerStore } from "@/lib/delivery/owner/pick-preferred-owner-store";
import { KASAMA_OWNER_HUB_BADGE_REFRESH } from "@/lib/chats/chat-channel-events";

export const OWNER_ACTIVE_STORE_SESSION_KEY = "samarket:owner:active-store-id:v1";
/** Cookie for SSR first paint — must match session ACTIVE_STORE. */
export const OWNER_ACTIVE_STORE_COOKIE = "sam_owner_active_store_id";
export const OWNER_ACTIVE_STORE_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 180;

export type ResolveOwnerActiveStoreInput = {
  stores: readonly { id: string }[];
  /** URL `?storeId=` when present and owned */
  routeStoreId?: string | null;
  /** Persisted OwnerLite / session preferred */
  preferredStoreId?: string | null;
};

export function resolveOwnerActiveStoreId(input: ResolveOwnerActiveStoreInput): string | null {
  const stores = input.stores;
  if (!stores.length) return null;

  const route = String(input.routeStoreId ?? "").trim();
  if (route && stores.some((s) => s.id === route)) return route;

  const preferred = String(input.preferredStoreId ?? "").trim();
  if (preferred && stores.some((s) => s.id === preferred)) return preferred;

  const fallback = pickPreferredOwnerStore(stores as unknown as StoreRow[]);
  return fallback?.id?.trim() || stores[0]?.id?.trim() || null;
}

export function resolveOwnerActiveStoreRow<T extends { id: string }>(
  stores: readonly T[],
  opts?: { routeStoreId?: string | null; preferredStoreId?: string | null }
): T | null {
  const id = resolveOwnerActiveStoreId({
    stores,
    routeStoreId: opts?.routeStoreId,
    preferredStoreId: opts?.preferredStoreId,
  });
  if (!id) return null;
  return stores.find((s) => s.id === id) ?? null;
}

export function readOwnerActiveStoreIdFromSession(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(OWNER_ACTIVE_STORE_SESSION_KEY);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function writeOwnerActiveStoreCookie(storeId: string | null): void {
  if (typeof document === "undefined") return;
  try {
    if (!storeId) {
      document.cookie = `${OWNER_ACTIVE_STORE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
      return;
    }
    document.cookie = `${OWNER_ACTIVE_STORE_COOKIE}=${encodeURIComponent(storeId)}; Path=/; Max-Age=${OWNER_ACTIVE_STORE_COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

export function readOwnerActiveStoreIdFromCookieHeader(
  cookieHeader: string | null | undefined
): string | null {
  const raw = String(cookieHeader ?? "");
  if (!raw) return null;
  const parts = raw.split(";");
  for (const part of parts) {
    const [k, ...rest] = part.trim().split("=");
    if (k === OWNER_ACTIVE_STORE_COOKIE) {
      try {
        const v = decodeURIComponent(rest.join("=").trim());
        return v || null;
      } catch {
        return rest.join("=").trim() || null;
      }
    }
  }
  return null;
}

/** Persist preferred active store — shell selection / route storeId write here. */
export function writeOwnerActiveStoreIdToSession(storeId: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const sid = String(storeId ?? "").trim();
  try {
    const prev = window.sessionStorage.getItem(OWNER_ACTIVE_STORE_SESSION_KEY)?.trim() ?? "";
    if (!sid) {
      window.sessionStorage.removeItem(OWNER_ACTIVE_STORE_SESSION_KEY);
      writeOwnerActiveStoreCookie(null);
      return;
    }
    window.sessionStorage.setItem(OWNER_ACTIVE_STORE_SESSION_KEY, sid);
    writeOwnerActiveStoreCookie(sid);
    if (prev !== sid) {
      window.dispatchEvent(new Event(KASAMA_OWNER_HUB_BADGE_REFRESH));
    }
  } catch {
    /* ignore */
  }
}

export function clearOwnerActiveStoreIdSession(): void {
  writeOwnerActiveStoreIdToSession(null);
}
