"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { logCallPermission } from "@/lib/community-messenger/direct-call-permission";
import {
  communityMessengerRoomIsConfirmedDelivery,
  communityMessengerRoomIsConfirmedTrade,
  generalFriendDirectRoomGate,
} from "@/lib/community-messenger/messenger-room-domain";
import { onCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import {
  parseSocialRelationRowForRoomSync,
  patchRoomSnapshotAfterFriendshipAccepted,
} from "@/lib/community-messenger/room/messenger-room-friendship-sync";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { messengerPrivateBroadcastChannelOptions } from "@/lib/community-messenger/realtime/private-broadcast-client";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

/** general pair direct_key — legacy contextMeta.trade 잔재여도 friendship RT·refresh 유지 */
export function shouldRunMessengerRoomFriendshipSync(
  room: Pick<CommunityMessengerRoomSummary, "roomType" | "contextMeta" | "messengerDirectKey" | "peerUserId">,
  viewerUserId?: string | null
): boolean {
  if (room.roomType !== "direct") return false;
  if (generalFriendDirectRoomGate(room, viewerUserId)) return true;
  if (communityMessengerRoomIsConfirmedTrade(room as CommunityMessengerRoomSummary)) return false;
  if (communityMessengerRoomIsConfirmedDelivery(room as CommunityMessengerRoomSummary)) return false;
  return true;
}

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
  /** P-2 — 원시값만 effect deps. snapshot.room 객체(읽음 등) 변경으로 채널 teardown 금지 */
  const viewerUserId = snapshot?.viewerUserId?.trim() ?? "";
  const peerUserId = snapshot?.room?.peerUserId?.trim() ?? "";
  const roomType = snapshot?.room?.roomType ?? "";
  const shouldSync =
    Boolean(viewerUserId && peerUserId && roomType === "direct" && snapshot?.room) &&
    shouldRunMessengerRoomFriendshipSync(
      {
        roomType: snapshot!.room.roomType,
        contextMeta: snapshot!.room.contextMeta,
        messengerDirectKey: snapshot!.room.messengerDirectKey,
        peerUserId: snapshot!.room.peerUserId,
      },
      viewerUserId
    );

  useEffect(() => {
    const rid = String(roomId ?? "").trim();
    if (!viewerUserId || !peerUserId || !rid || !roomReadyForRealtime || !shouldSync) return;

    const sb = getSupabaseClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = (optimisticAccepted: boolean) => {
      if (optimisticAccepted) {
        setSnapshot((prev) => (prev ? patchRoomSnapshotAfterFriendshipAccepted(prev, peerUserId) : prev));
      }
      logCallPermission("stale_room_refresh", {
        callerUserId: viewerUserId,
        calleeUserId: peerUserId,
        roomId: rid,
      });
      if (debounceTimer != null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void refresh(true, { triggerReason: "friendship_sync" });
      }, 180);
    };

    const onSocialRelationPayload = (row: Record<string, unknown>, eventType?: string) => {
      const parsed = parseSocialRelationRowForRoomSync(row, viewerUserId, peerUserId, eventType);
      if (!parsed.shouldRefresh) return;
      scheduleRefresh(parsed.optimisticAccepted);
    };

    /** F-9 — Contact SSOT user_social_relations (owner=viewer). Legacy friendships table 구독 제거. */
    const channel = sb
      ? sb
          .channel(
            `cm-room-social-relation:${viewerUserId}:${peerUserId}`,
            messengerPrivateBroadcastChannelOptions()
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "user_social_relations",
              filter: `owner_user_id=eq.${viewerUserId}`,
            },
            (payload) => {
              const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
              if (row) onSocialRelationPayload(row, payload.eventType);
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
    viewerUserId,
    peerUserId,
    shouldSync,
  ]);
}
