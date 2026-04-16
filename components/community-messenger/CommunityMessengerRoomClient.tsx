"use client";

import { useEffect, useMemo } from "react";
import { MessengerRoomGroupCallShell } from "@/lib/community-messenger/room/MessengerRoomGroupCallShell";
import {
  MessengerRoomClientPhase1Context,
} from "@/lib/community-messenger/room/messenger-room-client-phase1-context";
import { useMessengerRoomClientPhase1 } from "@/lib/community-messenger/room/use-messenger-room-client-phase1";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { CommunityMessengerRoomClientPhase2 } from "@/components/community-messenger/room/CommunityMessengerRoomPhase2";
import { shouldRunMessengerListRoutePrefetch } from "@/lib/runtime/next-js-dev-client";

export function CommunityMessengerRoomClient(props: {
  roomId: string;
  initialCallAction?: string;
  initialCallSessionId?: string;
  /** RSC에서 `loadCommunityMessengerRoomBootstrap` — 첫 페인트까지 클라이언트 대기 완화 */
  initialServerSnapshot?: CommunityMessengerRoomSnapshot | null;
}) {
  const phase1 = useMessengerRoomClientPhase1(props);
  useEffect(() => {
    if (!shouldRunMessengerListRoutePrefetch()) return;
    // 복귀 시 홈(리스트) 청크 로드 대기 최소화 — `next dev` 에서는 컴파일 큐만 키우므로 생략
    try {
      void phase1.router.prefetch?.("/community-messenger?section=chats");
      void phase1.router.prefetch?.("/community-messenger?section=chats&filter=private_group");
    } catch {
      /* ignore */
    }
  }, [phase1.router]);
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
  const groupCallBridgeDeps = useMemo(
    () => ({
      enabled: isGroupRoomForShell,
      roomId: phase1.roomId,
      viewerUserId: phase1.snapshot?.viewerUserId ?? "",
      roomLabel: phase1.snapshot?.room.title ?? phase1.t("nav_messenger_group_call"),
      activeCall: phase1.snapshot?.activeCall?.sessionMode === "group" ? phase1.snapshot.activeCall : null,
      onRefresh: () => {
        void phase1.refresh(true);
      },
    }),
    [isGroupRoomForShell, phase1.roomId, phase1.snapshot, phase1.refresh, phase1.t]
  );

  return (
    <MessengerRoomClientPhase1Context.Provider value={phase1}>
      <MessengerRoomGroupCallShell isGroupRoom={isGroupRoomForShell} bridgeDeps={groupCallBridgeDeps}>
        <CommunityMessengerRoomClientPhase2 />
      </MessengerRoomGroupCallShell>
    </MessengerRoomClientPhase1Context.Provider>
  );
}
