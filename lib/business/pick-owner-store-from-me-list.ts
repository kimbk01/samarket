import {
  readOwnerActiveStoreIdFromSession,
  resolveOwnerActiveStoreRow,
} from "@/lib/delivery/owner/resolve-owner-active-store";

/**
 * `GET /api/me/stores` 목록에서 Owner ACTIVE STORE (MODEL A) 를 고른다.
 * Priority: URL `storeId` → session preferred → pickPreferredOwnerStore → first owned.
 * DO NOT: use raw `stores[0]` as active-store authority outside this / resolveOwnerActiveStore*.
 */
export function pickOwnerStoreFromMeList<T extends { id: string }>(
  stores: T[],
  routeStoreId: string | null | undefined,
  /** Explicit preferred (e.g. SSR cookie). Omit on client → session. */
  preferredStoreId?: string | null
): T | null {
  if (stores.length === 0) return null;
  const preferred =
    preferredStoreId !== undefined
      ? preferredStoreId
      : typeof window !== "undefined"
        ? readOwnerActiveStoreIdFromSession()
        : null;
  return resolveOwnerActiveStoreRow(stores, {
    routeStoreId,
    preferredStoreId: preferred,
  });
}
