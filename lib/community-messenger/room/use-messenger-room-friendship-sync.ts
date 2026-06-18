"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { logCallPermission } from "@/lib/community-messenger/direct-call-permission";
import {
  communityMessengerRoomIsConfirmedDelivery,
  communityMessengerRoomIsConfirmedTrade,
} from "@/lib/community-messenger/messenger-room-domain";
import { onCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import {
  parseFriendshipRowForRoomSync,
  patchRoomSnapshotAfterFriendshipAccepted,
} from "@/lib/community-messenger/room/messenger-room-friendship-sync";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { getSupabaseClient } from "@/lib/supabase/client";

type RefreshFn = (
  silent?: boolean,
  opts?: { triggerReason?: string; forceSilentNetwork?: boolean }
) => Promise<void>;

export function useMessengerRoomFriendshipSync({
  roomId,
  roomReadyForRealtime,
  snapshot,
  setSnapshot,
  refresh,
}: {
  roomId: string;
  roomReadyForRealtime: boolean;
  snapshot: CommunityMessengerRoomSnapshot | null;
  setSnapshot: Dispatch<SetStateAction<CommunityMessengerRoomSnapshot | null>>;
  refresh: RefreshFn;
}): void {
  useEffect(() => {
    const viewerId = snapshot?.viewerUserId?.trim() ?? "";
    const peerUserId = snapshot?.room?.peerUserId?.trim() ?? "";
    const rid = String(roomId ?? "").trim();
    if (!viewerId || !peerUserId || !rid || !roomReadyForRealtime) return;
    if (snapshot?.room?.roomType !== "direct") return;
    if (communityMessengerRoomIsConfirmedTrade(snapshot.room)) return;
    if (communityMessengerRoomIsConfirmedDelivery(snapshot.room)) return;

    const sb = getSupabaseClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = (optimisticAccepted: boolean) => {
      if (optimisticAccepted) {
        setSnapshot((prev) => (prev ? patchRoomSnapshotAfterFriendshipAccepted(prev, peerUserId) : prev));
      }
      logCallPermission("stale_room_refresh", {
        callerUserId: viewerId,
        calleeUserId: peerUserId,
        roomId: rid,
      });
      if (debounceTimer != null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void refresh(true, { triggerReason: "friendship_sync" });
      }, 180);
    };

    const onFriendshipPayload = (row: Record<string, unknown>) => {
      const parsed = parseFriendshipRowForRoomSync(row, viewerId, peerUserId);
      if (!parsed.shouldRefresh) return;
      scheduleRefresh(parsed.optimisticAccepted);
    };

    const channel = sb
      ? sb
          .channel(`cm-room-friendship:${viewerId}:${peerUserId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "community_messenger_friendships",
              filter: `requester_user_id=eq.${viewerId}`,
            },
            (payload) => {
              const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
              if (row) onFriendshipPayload(row);
            }
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "community_messenger_friendships",
              filter: `addressee_user_id=eq.${viewerId}`,
            },
            (payload) => {
              const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
              if (row) onFriendshipPayload(row);
            }
          )
          .subscribe()
      : null;

    const unsubBus = onCommunityMessengerBusEvent((ev) => {
      if (ev.type === "cm.home.social_sync") scheduleRefresh(false);
    });

    return () => {
      if (debounceTimer != null) clearTimeout(debounceTimer);
      unsubBus();
      if (sb && channel) {
        try {
          void sb.removeChannel(channel);
        } catch {
          /* ignore */
        }
      }
    };
  }, [
    refresh,
    roomId,
    roomReadyForRealtime,
    setSnapshot,
    snapshot?.room,
    snapshot?.viewerUserId,
  ]);
}
