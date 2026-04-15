"use client";

import type { ComponentType, ReactNode } from "react";
import { useLayoutEffect, useState } from "react";
import {
  CommunityMessengerGroupCallContext,
  DIRECT_ROOM_GROUP_CALL_STUB,
} from "@/lib/community-messenger/room/community-messenger-group-call-context";
import type { CommunityMessengerGroupCallBridgeDeps } from "@/lib/community-messenger/room/CommunityMessengerGroupCallProviderBridge";

type GroupCallBridgeProps = CommunityMessengerGroupCallBridgeDeps & { children: ReactNode };

let cachedGroupCallBridge: ComponentType<GroupCallBridgeProps> | null = null;

/**
 * 1:1 방: 스텁 컨텍스트만 — WebRTC·시그널 모듈 그래프 미사용.
 * 그룹 방: `CommunityMessengerGroupCallProviderBridge` 를 동적 import — 초기 JS 에서
 * `use-community-messenger-group-call` 트리를 분리한다. 모듈 캐시가 있으면 첫 프레임부터 실제 Provider.
 */
export function MessengerRoomGroupCallShell({
  isGroupRoom,
  bridgeDeps,
  children,
}: {
  isGroupRoom: boolean;
  bridgeDeps: CommunityMessengerGroupCallBridgeDeps;
  children: ReactNode;
}) {
  const [Bridge, setBridge] = useState<ComponentType<GroupCallBridgeProps> | null>(
    () => cachedGroupCallBridge
  );

  useLayoutEffect(() => {
    if (!isGroupRoom) {
      return;
    }
    if (cachedGroupCallBridge) {
      setBridge(() => cachedGroupCallBridge);
      return;
    }
    let cancelled = false;
    void import(
      /* webpackChunkName: "messenger-group-call-bridge" */
      "@/lib/community-messenger/room/CommunityMessengerGroupCallProviderBridge"
    ).then((m) => {
      if (cancelled) return;
      cachedGroupCallBridge = m.CommunityMessengerGroupCallProviderBridge;
      setBridge(() => cachedGroupCallBridge);
    });
    return () => {
      cancelled = true;
    };
  }, [isGroupRoom]);

  if (!isGroupRoom) {
    return (
      <CommunityMessengerGroupCallContext.Provider value={DIRECT_ROOM_GROUP_CALL_STUB}>
        {children}
      </CommunityMessengerGroupCallContext.Provider>
    );
  }

  if (!Bridge) {
    return (
      <CommunityMessengerGroupCallContext.Provider value={DIRECT_ROOM_GROUP_CALL_STUB}>
        {children}
      </CommunityMessengerGroupCallContext.Provider>
    );
  }

  return <Bridge {...bridgeDeps}>{children}</Bridge>;
}
