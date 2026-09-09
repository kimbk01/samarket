"use client";

/**
 * Data Reset — targeted client invalidation only.
 * NEVER localStorage.clear / sessionStorage.clear / wipeClientSessionState.
 * Auth session, device binding, native call state preserved.
 */

import { clearBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { clearAllRoomSnapshotCaches } from "@/lib/community-messenger/room-snapshot-cache";
import { clearAllPhilifeFeedPersistentCaches } from "@/lib/community/philife-feed-session-cache";
import { invalidateNeighborhoodFeedClientShortTtl } from "@/lib/philife/fetch-neighborhood-feed-short-ttl";
import { invalidateHomePostsCache } from "@/lib/posts/getPostsForHome";
import { clearAllStoresBrowseSessionCaches } from "@/lib/stores/stores-browse-client-session-cache";
import { invalidateStoresBrowseMemoryCache } from "@/lib/stores/stores-browse-response-cache";
import { clearAllStoreHomeFeedClientCaches } from "@/lib/stores/store-home-feed-client-cache";
import { resetOwnerHubBadgeStoreForAuthEpoch } from "@/lib/chats/owner-hub-badge-store";
import type { DataResetClientInvalidationNamespace } from "@/lib/admin/data-reset/derived-state";

export type ApplyDataResetClientInvalidationResult = {
  applied: DataResetClientInvalidationNamespace[];
  skipped: string[];
};

/**
 * Apply only namespaces returned by Data Reset execute plan.
 * Does not sign out, clear auth cookies, or wipe device keys.
 */
export function applyDataResetClientInvalidation(
  namespaces: readonly string[] | null | undefined
): ApplyDataResetClientInvalidationResult {
  const applied: DataResetClientInvalidationNamespace[] = [];
  const skipped: string[] = [];
  const set = new Set((namespaces ?? []).map(String));

  const run = (ns: DataResetClientInvalidationNamespace, fn: () => void) => {
    if (!set.has(ns)) return;
    try {
      fn();
      applied.push(ns);
    } catch {
      skipped.push(`${ns}:error`);
    }
  };

  run("community_feed", () => {
    clearAllPhilifeFeedPersistentCaches();
    invalidateNeighborhoodFeedClientShortTtl();
  });

  run("market_feed", () => {
    invalidateHomePostsCache({ notifyListReload: true });
  });

  run("delivery_browse", () => {
    invalidateStoresBrowseMemoryCache();
    clearAllStoresBrowseSessionCaches();
    clearAllStoreHomeFeedClientCaches();
  });

  run("chat_bootstrap", () => {
    clearBootstrapCache();
  });

  run("chat_room_snapshots", () => {
    clearAllRoomSnapshotCaches();
  });

  run("friend_lists", () => {
    clearBootstrapCache();
  });

  run("hub_badge_memory", () => {
    // Memory-only hub badge store reset — does not delete device tokens / auth.
    resetOwnerHubBadgeStoreForAuthEpoch();
  });

  for (const ns of set) {
    if (
      !(
        [
          "community_feed",
          "market_feed",
          "delivery_browse",
          "chat_bootstrap",
          "chat_room_snapshots",
          "friend_lists",
          "hub_badge_memory",
        ] as string[]
      ).includes(ns)
    ) {
      skipped.push(`${ns}:unknown`);
    }
  }

  return { applied, skipped };
}

/** Source contract helpers for tests — global clears must stay absent. */
export const DATA_RESET_CLIENT_INVALIDATION_SOURCE_FORBIDDEN = [
  "localStorage.clear(",
  "sessionStorage.clear(",
  "wipeClientSessionState(",
  "Preferences.clear(",
] as const;
