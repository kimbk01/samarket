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
import {
  parseDirectRoomPeerRelation,
  patchRoomSnapshotPeerRelation,
} from "@/lib/community-messenger/room/direct-room-peer-relation-patch";
import { patchRoomPeerRelationInSnapshotCache } from "@/lib/community-messenger/room-snapshot-cache";
import {
  CM_FRIEND_REQUESTS_SYNCED_EVENT,
  type CmFriendRequestsSyncedDetail,
} from "@/lib/community-messenger/realtime/use-global-friend-request-feed";
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

  const isGeneralDirect = Boolean(
    snapshot?.room && viewerUserId && generalFriendDirectRoomGate(snapshot.room, viewerUserId)
  );
  /** §17-5 R-4: 관계 값 다시 받기 — 아래 effect 가 채우고, 친구 실시간 신호도 같은 함수를 부른다. */
  const syncPeerRelationRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const rid = String(roomId ?? "").trim();
    if (!viewerUserId || !peerUserId || !rid || !roomReadyForRealtime || !isGeneralDirect) {
      syncPeerRelationRef.current = null;
      return;
    }
    let cancelled = false;
    let inFlight = false;
    let again = false;
    const run = async () => {
      if (inFlight) {
        again = true;
        return;
      }
      inFlight = true;
      try {
        const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(rid)}/peer-relation`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          peerUserId?: string;
          relation?: unknown;
        } | null;
        const relation = json?.ok ? parseDirectRoomPeerRelation(json.relation) : null;
        /** 실패하면 지금 값을 그대로 둔다 */
        if (cancelled || !relation || json?.peerUserId !== peerUserId) return;
        setSnapshot((prev) =>
          prev && prev.room.id === rid ? patchRoomSnapshotPeerRelation(prev, peerUserId, relation) : prev
        );
        patchRoomPeerRelationInSnapshotCache({ roomId: rid, viewerUserId, peerUserId, relation });
      } catch {
        /* 지금 값 유지 */
      } finally {
        inFlight = false;
        if (again && !cancelled) {
          again = false;
          void run();
        }
      }
    };
    syncPeerRelationRef.current = () => void run();
    /** ① 방 진입 — 미리 받은·캐시 스냅샷의 관계 값이 오래됐을 수 있다(첫 화면은 막지 않음) */
    void run();
    /**
     * ② 친구 요청 변경(거절·취소·새 요청·수락)·앱 복귀·실시간 재연결 — 전역 친구 요청 피드가 서버 재조회 후 알린다.
     * 목록이 그대로인 재조회(홈 열기·첫 구독 등)는 관계 값이 바뀌지 않으므로 다시 받지 않는다(서버 부하 R1).
     */
    const onFriendRequestsSynced = (e: Event) => {
      const detail = (e as CustomEvent<CmFriendRequestsSyncedDetail>).detail;
      if (detail && detail.relationRecheck === false) return;
      void run();
    };
    window.addEventListener(CM_FRIEND_REQUESTS_SYNCED_EVENT, onFriendRequestsSynced);
    return () => {
      cancelled = true;
      syncPeerRelationRef.current = null;
      window.removeEventListener(CM_FRIEND_REQUESTS_SYNCED_EVENT, onFriendRequestsSynced);
    };
  }, [isGeneralDirect, peerUserId, roomId, roomReadyForRealtime, setSnapshot, viewerUserId]);

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
        /** silent refresh 는 관계 값을 다시 받지 않는다(§17-5) — ③ 친구·차단 실시간 신호도 관계 값을 다시 받는다 */
        syncPeerRelationRef.current?.();
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
            /** 비공개 채널 허용 토픽 `cm-room-friendship:<viewer>:…` (구 이름 cm-room-social-relation 은 거부됨 — D-14) */
            `cm-room-friendship:${viewerUserId}:${peerUserId}`,
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
