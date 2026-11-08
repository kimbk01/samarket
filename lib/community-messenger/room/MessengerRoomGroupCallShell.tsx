"use client";

import type { ComponentType, ReactNode } from "react";
import { useLayoutEffect, useState } from "react";
import {
  CommunityMessengerGroupCallContext,
  DIRECT_ROOM_GROUP_CALL_STUB,
} from "@/lib/community-messenger/room/community-messenger-group-call-context";
import type { CommunityMessengerGroupCallBridgeDeps } from "@/lib/community-messenger/room/CommunityMessengerGroupCallProviderBridge";
import type { CommunityMessengerGroupCallHandle } from "@/lib/community-messenger/use-community-messenger-group-call";

type GroupCallValueHostProps = CommunityMessengerGroupCallBridgeDeps & {
  onValue: (value: CommunityMessengerGroupCallHandle | null) => void;
};

let cachedGroupCallValueHost: ComponentType<GroupCallValueHostProps> | null = null;

/**
 * 1:1 방: 스텁 컨텍스트만 — WebRTC·시그널 모듈 그래프 미사용.
 * 그룹 방: 그룹 통화 모듈을 동적 import — 초기 JS 에서 `use-community-messenger-group-call` 트리를 분리한다.
 *
 * D2-다 (Owner 「설계대로 구현」 2026-11-09, `docs/audit/messenger-group-call-shell-remount-d2c-analysis-2026-11-09.md`):
 * Provider 는 **항상 같은 자리**에 그린다(트리 모양 고정). 모듈을 불러오면 형제 위치의 값 공급자
 * (`CommunityMessengerGroupCallValueHost`, 화면 없음)가 훅을 실행해 값만 올린다.
 * DO NOT: Provider 를 다른 컴포넌트로 감싸는 구조로 되돌리지 말 것 — 모듈 로드 후 방 화면 전체가 다시 만들어진다.
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
  const [ValueHost, setValueHost] = useState<ComponentType<GroupCallValueHostProps> | null>(
    () => cachedGroupCallValueHost
  );
  const [groupCallValue, setGroupCallValue] = useState<CommunityMessengerGroupCallHandle | null>(null);

  useLayoutEffect(() => {
    if (!isGroupRoom) {
      return;
    }
    if (cachedGroupCallValueHost) {
      setValueHost(() => cachedGroupCallValueHost);
      return;
    }
    let cancelled = false;
    void import(
      /* webpackChunkName: "messenger-group-call-bridge" */
      "@/lib/community-messenger/room/CommunityMessengerGroupCallProviderBridge"
    ).then((m) => {
      if (cancelled) return;
      cachedGroupCallValueHost = m.CommunityMessengerGroupCallValueHost;
      setValueHost(() => cachedGroupCallValueHost);
    });
    return () => {
      cancelled = true;
    };
  }, [isGroupRoom]);

  const hostActive = isGroupRoom && ValueHost != null;
  const value = hostActive && groupCallValue ? groupCallValue : DIRECT_ROOM_GROUP_CALL_STUB;

  return (
    <>
      {hostActive && ValueHost ? <ValueHost {...bridgeDeps} onValue={setGroupCallValue} /> : null}
      <CommunityMessengerGroupCallContext.Provider value={value}>{children}</CommunityMessengerGroupCallContext.Provider>
    </>
  );
}
