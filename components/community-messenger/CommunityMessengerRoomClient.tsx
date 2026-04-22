"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { MessengerRoomGroupCallShell } from "@/lib/community-messenger/room/MessengerRoomGroupCallShell";
import {
  MessengerRoomClientPhase1Context,
} from "@/lib/community-messenger/room/messenger-room-client-phase1-context";
import { useMessengerRoomClientPhase1 } from "@/lib/community-messenger/room/use-messenger-room-client-phase1";
import { recordRouteEntryElapsedMetricOnce } from "@/lib/runtime/samarket-runtime-debug";
import { useCommunityMessengerPresenceRuntime } from "@/lib/community-messenger/realtime/presence/use-community-messenger-presence-runtime";
import type { CommunityMessengerCallSession, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { CommunityMessengerRoomClientPhase2 } from "@/components/community-messenger/room/CommunityMessengerRoomPhase2";
import { shouldRunMessengerListRoutePrefetch } from "@/lib/runtime/next-js-dev-client";
/** 방 A→B 이동마다 동일 RSC 청크 `prefetch` 가 반복되면 메인 스레드·RSC 큐만 쓴다 — 세션당 1회로 제한 */
let communityMessengerListRoutesPrefetched = false;

if (typeof window !== "undefined") {
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "client_component_module_eval_start_ms");
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "client_component_module_eval_end_ms");
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "CommunityMessengerRoomClient_first_import_ready_ms");
}

export function CommunityMessengerRoomClient(props: {
  roomId: string;
  initialCallAction?: string;
  initialCallSessionId?: string;
  /** RSC에서 `loadCommunityMessengerRoomBootstrap` — 첫 페인트까지 클라이언트 대기 완화 */
  initialServerSnapshot?: CommunityMessengerRoomSnapshot | null;
  /** RSC 세션 힌트(가벼움). peek·single-flight 키에만 쓰이며 스냅샷 본문은 클라 부트스트랩으로 확정된다. */
  initialViewerUserId?: string | null;
}) {
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "first_client_component_mount_ms");
  const phase1 = useMessengerRoomClientPhase1(props);
  const router = useRouter();
  useCommunityMessengerPresenceRuntime(phase1.snapshot?.viewerUserId ?? props.initialServerSnapshot?.viewerUserId ?? null);
  useEffect(() => {
    if (!shouldRunMessengerListRoutePrefetch()) return;
    if (communityMessengerListRoutesPrefetched) return;
    communityMessengerListRoutesPrefetched = true;
    // 복귀 시 홈(리스트) 청크 로드 대기 최소화 — `next dev` 에서는 컴파일 큐만 키우므로 생략
    try {
      void router.prefetch?.("/community-messenger?section=chats");
      void router.prefetch?.("/community-messenger?section=chats&filter=private_group");
    } catch {
      /* ignore */
    }
  }, [router]);
  const isGroupRoomForShell = Boolean(
    phase1.snapshot?.room.roomType && phase1.snapshot.room.roomType !== "direct"
  );
  const initialServerIsGroupRoom = Boolean(
    props.initialServerSnapshot?.room.roomType &&
      props.initialServerSnapshot.room.roomType !== "direct"
  );

  useEffect(() => {
    if (!initialServerIsGroupRoom) return;
    void import(
      /* webpackChunkName: "messenger-group-call-bridge" */
      "@/lib/community-messenger/room/CommunityMessengerGroupCallProviderBridge"
    );
  }, [initialServerIsGroupRoom]);

  const ac = phase1.snapshot?.activeCall;
  const groupCallParticipantSig =
    ac?.participants?.map((p) => `${p.userId}:${p.status}`).join("|") ?? "";

  const activeCallForGroupBridge: CommunityMessengerCallSession | null = useMemo(() => {
    const cur = phase1.snapshot?.activeCall;
    if (!cur || cur.sessionMode !== "group") return null;
    return cur;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 메시지 스냅샷 전체 대신 통화 식별·참가자 시그만으로 참조 안정화
  }, [
    ac?.id,
    ac?.sessionMode,
    ac?.status,
    ac?.startedAt,
    ac?.answeredAt,
    ac?.endedAt,
    groupCallParticipantSig,
  ]);

  const groupCallBridgeDeps = useMemo(
    () => ({
      enabled: isGroupRoomForShell,
      roomId: phase1.roomId,
      viewerUserId: phase1.snapshot?.viewerUserId ?? "",
      roomLabel: phase1.snapshot?.room.title ?? phase1.t("nav_messenger_group_call"),
      activeCall: activeCallForGroupBridge,
      onRefresh: () => {
        void phase1.refresh(true);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- phase1 객체 전체가 아닌 그룹통화 브리지에 필요한 필드만
    [
      isGroupRoomForShell,
      phase1.roomId,
      phase1.snapshot?.viewerUserId,
      phase1.snapshot?.room.title,
      activeCallForGroupBridge,
      phase1.refresh,
      phase1.t,
    ]
  );
  return (
    <MessengerRoomClientPhase1Context.Provider value={phase1}>
      <MessengerRoomGroupCallShell isGroupRoom={isGroupRoomForShell} bridgeDeps={groupCallBridgeDeps}>
        <CommunityMessengerRoomClientPhase2 />
      </MessengerRoomGroupCallShell>
    </MessengerRoomClientPhase1Context.Provider>
  );
}
