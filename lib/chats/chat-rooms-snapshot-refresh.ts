/**
 * Event-driven chat rooms snapshot refresh (CR1).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshChatRoomsSnapshotFromRpc } from "@/lib/chats/chat-rooms-snapshot";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

const refreshInflight = new Map<string, Promise<unknown>>();

export function scheduleChatRoomsSnapshotRefresh(userId: string): void {
  const uid = userId.trim();
  if (!uid || refreshInflight.has(uid)) return;

  const flight = (async () => {
    const sb = tryCreateSupabaseServiceClient();
    if (!sb) return null;
    return refreshChatRoomsSnapshotFromRpc(sb as SupabaseClient<any>, uid);
  })().finally(() => {
    if (refreshInflight.get(uid) === flight) refreshInflight.delete(uid);
  });

  refreshInflight.set(uid, flight);
  void flight.catch(() => {});
}
