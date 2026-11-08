"use client";

import { memo, useLayoutEffect, useRef } from "react";
import { useCommunityMessengerGroupCall } from "@/lib/community-messenger/use-community-messenger-group-call";
import type { CommunityMessengerGroupCallHandle } from "@/lib/community-messenger/use-community-messenger-group-call";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

export type CommunityMessengerGroupCallBridgeDeps = {
  enabled: boolean;
  roomId: string;
  viewerUserId: string;
  roomLabel: string;
  activeCall: CommunityMessengerCallSession | null;
  onRefresh: () => void | Promise<void>;
};

/** 훅이 돌려주는 객체는 매 렌더 새로 만들어진다 — 필드가 하나라도 바뀌었을 때만 셸에 올린다. */
export function isSameGroupCallHandle(
  a: CommunityMessengerGroupCallHandle | null,
  b: CommunityMessengerGroupCallHandle | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a) as Array<keyof CommunityMessengerGroupCallHandle>;
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => Object.is(a[k], b[k]));
}

/**
 * D2-다 (Owner 「설계대로 구현」 2026-11-09, `docs/audit/messenger-group-call-shell-remount-d2c-analysis-2026-11-09.md`):
 * 그룹 통화 훅을 실행하고 값만 셸(`MessengerRoomGroupCallShell`)로 올리는 화면 없는 공급자.
 * 이전에는 Provider 와 방 화면(children)을 감싸, 모듈을 불러온 뒤 셸 아래 트리 모양이 바뀌며
 * 방 화면 전체가 다시 만들어졌다(그룹방 첫 진입 시 대화 상자가 맨 위로 튐 — 운영 React 트리로 확인).
 *
 * - 훅 실행 시점·효과(세션 구독·활성 통화 동기화·타이머·종료음·미디어 정리)는 이전과 같다(이 컴포넌트가 마운트될 때).
 * - 값은 layout effect 에서 올린다(페인트 전). 같은 값이면 올리지 않는다.
 * - `memo`: 셸이 다시 그려져도 props 가 같으면 다시 실행되지 않는다 — 값 올림 → 셸 렌더 → 다시 올림 반복 방지.
 * - 언마운트(방 나감·방 종류 변경) 시 null 을 올려 셸이 임시 값으로 돌아가게 한다. 미디어 정리는 훅 자체가 한다.
 */
export const CommunityMessengerGroupCallValueHost = memo(function CommunityMessengerGroupCallValueHost({
  onValue,
  ...deps
}: CommunityMessengerGroupCallBridgeDeps & {
  onValue: (value: CommunityMessengerGroupCallHandle | null) => void;
}) {
  const value = useCommunityMessengerGroupCall(deps);
  const lastSentRef = useRef<CommunityMessengerGroupCallHandle | null>(null);

  useLayoutEffect(() => {
    if (isSameGroupCallHandle(lastSentRef.current, value)) return;
    lastSentRef.current = value;
    onValue(value);
  });

  useLayoutEffect(
    () => () => {
      lastSentRef.current = null;
      onValue(null);
    },
    [onValue]
  );

  return null;
});
