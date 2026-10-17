"use client";

import { invalidateAdminFetchCache } from "@/lib/admin/admin-fetch-client";

/**
 * Admin Action Queue mutation signal (same tab).
 *
 * Every admin processing UI calls `emitAdminQueueChanged` after a successful
 * mutation so Bell · sidebar · Action Queue cards re-read the durable COUNT
 * immediately instead of waiting for the poll. Other tabs/admins converge via
 * Realtime (RT_REQUIRED categories) or the poll.
 */
export const ADMIN_QUEUE_CHANGED_EVENT = "dibay:admin-queue-changed";

/** adminFetch dedupe keys that carry Action Queue COUNTs. */
export const ADMIN_QUEUE_CACHE_KEYS = ["admin:bell:", "admin:cp-overview"] as const;

export type AdminQueueChangedDetail = { category: string | null };

export function emitAdminQueueChanged(category?: string): void {
  for (const key of ADMIN_QUEUE_CACHE_KEYS) invalidateAdminFetchCache(key);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AdminQueueChangedDetail>(ADMIN_QUEUE_CHANGED_EVENT, {
      detail: { category: category ?? null },
    })
  );
}
