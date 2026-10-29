import type { SupabaseClient } from "@supabase/supabase-js";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  loadStoreCommerceMeta,
  type StoreCommerceMeta,
} from "@/lib/stores/get-approved-store-by-slug";
import {
  resolveStoreOrderability,
  type StoreOrderability,
} from "@/lib/stores/store-orderability-policy";

const TTL_MS = 30_000;

type MetaRow = { expiresAt: number; value: StoreCommerceMeta };
type OrderRow = { expiresAt: number; value: StoreOrderability };

const metaCache = new Map<string, MetaRow>();
const orderabilityCache = new Map<string, OrderRow>();

function metaKey(storeId: string, viewerUserId: string | null): string {
  return `${storeId.trim()}|${viewerUserId?.trim() || "__anon__"}`;
}

function orderKey(viewerUserId: string | null, ownerUserId: unknown): string {
  return `${viewerUserId?.trim() || "__anon__"}|${String(ownerUserId ?? "").trim()}`;
}

export function peekStoreCommerceMetaCached(
  storeId: string,
  viewerUserId: string | null
): StoreCommerceMeta | null {
  const k = metaKey(storeId, viewerUserId);
  const hit = metaCache.get(k);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  return null;
}

export async function loadStoreCommerceMetaCached(
  sb: SupabaseClient,
  storeId: string,
  viewerUserId: string | null
): Promise<StoreCommerceMeta> {
  const k = metaKey(storeId, viewerUserId);
  const hit = metaCache.get(k);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  return runSingleFlight(`store-commerce-meta:${k}`, async () => {
    const again = metaCache.get(k);
    if (again && again.expiresAt > Date.now()) return again.value;
    const value = await loadStoreCommerceMeta(sb, storeId, viewerUserId);
    metaCache.set(k, { expiresAt: Date.now() + TTL_MS, value });
    return value;
  });
}

export async function resolveStoreOrderabilityCached(
  sb: SupabaseClient,
  viewerUserId: string | null | undefined,
  ownerUserId: unknown
): Promise<StoreOrderability> {
  const k = orderKey(viewerUserId ?? null, ownerUserId);
  const hit = orderabilityCache.get(k);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  return runSingleFlight(`store-orderability:${k}`, async () => {
    const again = orderabilityCache.get(k);
    if (again && again.expiresAt > Date.now()) return again.value;
    const value = await resolveStoreOrderability(sb, viewerUserId, ownerUserId);
    orderabilityCache.set(k, { expiresAt: Date.now() + TTL_MS, value });
    return value;
  });
}

/** summary·menus 동시 cold 시 meta+orderability 1회 합류 */
export async function loadStorePublicMetaBundleCached(
  sb: SupabaseClient,
  storeId: string,
  viewerUserId: string | null,
  ownerUserId: unknown
): Promise<{ meta: StoreCommerceMeta; orderability: StoreOrderability }> {
  const bundleKey = `${metaKey(storeId, viewerUserId)}|${orderKey(viewerUserId, ownerUserId)}`;
  return runSingleFlight(`store-public-meta-bundle:${bundleKey}`, async () => {
    const [meta, orderability] = await Promise.all([
      loadStoreCommerceMetaCached(sb, storeId, viewerUserId),
      resolveStoreOrderabilityCached(sb, viewerUserId, ownerUserId),
    ]);
    return { meta, orderability };
  });
}

export function resetStoreCommerceMetaCachesForTests(): void {
  metaCache.clear();
  orderabilityCache.clear();
}
