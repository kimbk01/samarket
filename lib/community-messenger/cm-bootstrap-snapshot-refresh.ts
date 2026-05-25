/**
 * Event-driven CM bootstrap snapshot refresh (CMB1).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshCmBootstrapSnapshotFromRpc } from "@/lib/community-messenger/cm-bootstrap-snapshot";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

const refreshInflight = new Map<string, Promise<unknown>>();

export function scheduleCmBootstrapSnapshotRefresh(userId: string): void {
  const uid = userId.trim();
  if (!uid || refreshInflight.has(uid)) return;

  const flight = (async () => {
    const sb = tryCreateSupabaseServiceClient();
    if (!sb) return null;
    return refreshCmBootstrapSnapshotFromRpc(sb as SupabaseClient<any>, uid);
  })().finally(() => {
    if (refreshInflight.get(uid) === flight) refreshInflight.delete(uid);
  });

  refreshInflight.set(uid, flight);
  void flight.catch(() => {});
}
