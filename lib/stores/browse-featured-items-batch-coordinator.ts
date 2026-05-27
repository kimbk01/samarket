"use client";

import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";
import { fetchBrowseFeaturedItemsBatch } from "@/lib/stores/fetch-browse-featured-items-client";

const FLUSH_DEBOUNCE_MS = 48;

const pendingStoreIds = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let drainPromise: Promise<void> | null = null;
const waiters: Array<{
  storeIds: string[];
  resolve: (map: Map<string, BrowseFeaturedCardItem[]>) => void;
  reject: (err: unknown) => void;
}> = [];

function scheduleDrain(): void {
  if (drainPromise) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    drainPromise = drainPending().finally(() => {
      drainPromise = null;
      if (pendingStoreIds.size > 0 || waiters.length > 0) scheduleDrain();
    });
  }, FLUSH_DEBOUNCE_MS);
}

async function drainPending(): Promise<void> {
  while (pendingStoreIds.size > 0 || waiters.length > 0) {
    if (pendingStoreIds.size === 0) break;

    const batch = [...pendingStoreIds];
    pendingStoreIds.clear();
    const batchWaiters = waiters.splice(0, waiters.length);

    try {
      const { byStoreId } = await fetchBrowseFeaturedItemsBatch(batch);
      for (const w of batchWaiters) {
        const slice = new Map<string, BrowseFeaturedCardItem[]>();
        for (const id of w.storeIds) {
          slice.set(id, byStoreId.get(id) ?? []);
        }
        w.resolve(slice);
      }
    } catch (err) {
      for (const w of batchWaiters) w.reject(err);
      throw err;
    }
  }
}

/**
 * 동일 debounce 창의 featured-items 요청을 하나의 batch fetch 로 합친다.
 * `fetchBrowseFeaturedItemsBatch` single-flight·TTL 과 함께 `/stores` 카드·레일 중복 GET 방지.
 */
export function scheduleBrowseFeaturedItemsBatch(
  storeIds: readonly string[]
): Promise<Map<string, BrowseFeaturedCardItem[]>> {
  const unique = [...new Set(storeIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return Promise.resolve(new Map());
  }

  for (const id of unique) pendingStoreIds.add(id);

  return new Promise((resolve, reject) => {
    waiters.push({ storeIds: unique, resolve, reject });
    scheduleDrain();
  });
}

/** 테스트·HMR */
export function resetBrowseFeaturedItemsBatchCoordinatorForTests(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  pendingStoreIds.clear();
  drainPromise = null;
  waiters.splice(0, waiters.length);
}
