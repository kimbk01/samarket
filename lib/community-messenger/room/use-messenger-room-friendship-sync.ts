"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
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
import {
  removeCmRtChannelTracked,
  runAfterCmRtTopicRemoval,
} from "@/lib/community-messenger/realtime/cm-rt-channel-registry";
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

/** F-9: 방 친구관계 Realtime 채널 이름 — viewer·peer 원시값만으로 결정(P-2). */
export function messengerRoomFriendshipChannelName(viewerUserId: string, peerUserId: string): string {
  return `cm-room-friendship:${viewerUserId.trim()}:${peerUserId.trim()}`;
}

/**
 * P-2·F-9 — 1:1 방 친구관계 동기화.
 * - effect deps 는 **원시값만**(roomId·ready·roomType·peer·viewer·shouldRun boolean). snapshot 객체가 읽음·미읽음으로 바뀌어도 재구독하지 않는다.
 * - `refresh`·`setSnapshot` 은 ref 로 최신값을 읽는다.
 * - 구독 대상은 `user_social_relations`(owner_user_id=viewer; RLS owner read · realtime publication 포함). 레거시 friendships 테이블은 쓰기가 멈춰 이벤트가 없다.
 */
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
  const refreshRef = useRef(refresh);
  const setSnapshotRef = useRef(setSnapshot);
  useEffect(() => {
    refreshRef.current = refresh;
    setSnapshotRef.current = setSnapshot;
  }, [refresh, setSnapshot]);

  const viewerId = snapshot?.viewerUserId?.trim() ?? "";
  const peerUserId = snapshot?.room?.peerUserId?.trim() ?? "";
  const roomType = snapshot?.room?.roomType ?? null;
  const shouldRun = snapshot?.room
    ? shouldRunMessengerRoomFriendshipSync(snapshot.room, snapshot.viewerUserId)
    : false;
  const rid = String(roomId ?? "").trim();

  useEffect(() => {
    if (!viewerId || !peerUserId || !rid || !roomReadyForRealtime) return;
    if (roomType !== "direct") return;
    if (!shouldRun) return;

    const sb = getSupabaseClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = (optimisticAccepted: boolean) => {
      if (optimisticAccepted) {
        setSnapshotRef.current((prev) => (prev ? patchRoomSnapshotAfterFriendshipAccepted(prev, peerUserId) : prev));
      }
      logCallPermission("stale_room_refresh", {
        callerUserId: viewerId,
        calleeUserId: peerUserId,
        roomId: rid,
      });
      if (debounceTimer != null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void refreshRef.current(true, { triggerReason: "friendship_sync" });
      }, 180);
    };

    const channelName = messengerRoomFriendshipChannelName(viewerId, peerUserId);
    let channel: ReturnType<NonNullable<typeof sb>["channel"]> | null = null;
    let disposed = false;
    if (sb) {
      /** M-5: 같은 토픽 remove 완료 후에만 재생성(죽은 채널 재사용 방지). */
      runAfterCmRtTopicRemoval(channelName, () => {
        if (disposed) return;
        channel = sb
          .channel(channelName, messengerPrivateBroadcastChannelOptions())
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "user_social_relations",
              filter: `owner_user_id=eq.${viewerId}`,
            },
            (payload) => {
              const row = (payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old) as
                | Record<string, unknown>
                | null;
              if (!row) return;
              const parsed = parseSocialRelationRowForRoomSync(row, viewerId, peerUserId);
              if (!parsed.shouldRefresh) return;
              scheduleRefresh(parsed.optimisticAccepted);
            }
          )
          .subscribe();
      });
    }

    const unsubBus = onCommunityMessengerBusEvent((ev) => {
      if (ev.type === "cm.home.social_sync") scheduleRefresh(false);
    });

    return () => {
      if (debounceTimer != null) clearTimeout(debounceTimer);
      unsubBus();
      disposed = true;
      if (sb && channel) void removeCmRtChannelTracked(sb, channel, channelName);
      channel = null;
    };
  }, [peerUserId, rid, roomReadyForRealtime, roomType, shouldRun, viewerId]);
}
