/**
 * Event-driven owner hub badge snapshot refresh — write path on mutations.
 * Read path: owner-hub-badge-snapshot.ts (counter row / unified RPC).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  refreshOwnerHubBadgeSnapshotFromRpc,
  type OwnerHubBadgeSnapshotRow,
} from "@/lib/chats/owner-hub-badge-snapshot";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

const refreshInflight = new Map<string, Promise<OwnerHubBadgeSnapshotRow | null>>();

/** Fire-and-forget snapshot upsert after hub badge invalidation / domain events. */
export function scheduleOwnerHubBadgeSnapshotRefresh(userId: string): void {
  const uid = userId.trim();
  if (!uid || refreshInflight.has(uid)) return;

  const flight = (async (): Promise<OwnerHubBadgeSnapshotRow | null> => {
    const sb = tryCreateSupabaseServiceClient();
    if (!sb) return null;
    return refreshOwnerHubBadgeSnapshotFromRpc(sb as SupabaseClient<any>, uid);
  })().finally(() => {
    if (refreshInflight.get(uid) === flight) refreshInflight.delete(uid);
  });

  refreshInflight.set(uid, flight);
  void flight.catch(() => {});
}

/** Awaitable refresh — measurement / explicit reconciliation. */
export async function refreshOwnerHubBadgeSnapshotNow(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<OwnerHubBadgeSnapshotRow | null> {
  const uid = userId.trim();
  if (!uid) return null;
  return refreshOwnerHubBadgeSnapshotFromRpc(sbAny, uid);
}
