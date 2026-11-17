"use client";

import { useState } from "react";
import {
  carryDirectPeerReadCursorKey,
  sameMessengerReadOrderKey,
  type MessengerReadOrderKey,
} from "@/lib/community-messenger/room/messenger-outbound-read-state";

/**
 * F4 (설계 2026-11-18 PR-1): 1:1 상대 읽음 키 — 새 커서 행을 아직 못 찾으면 직전에 계산한 키를 유지한다.
 * 직전 키는 React 「이전 렌더 정보 저장」 패턴(렌더 중 조건부 setState)으로 방별로 기억한다.
 */
export function useCarriedDirectPeerReadCursorKey(args: {
  roomId: string;
  resolved: MessengerReadOrderKey | null;
  cursorId: string | null | undefined;
}): MessengerReadOrderKey | null {
  const roomId = args.roomId.trim();
  const [carry, setCarry] = useState<{ roomId: string; key: MessengerReadOrderKey | null }>(() => ({
    roomId,
    key: args.resolved,
  }));
  const previous = carry.roomId === roomId ? carry.key : null;
  if (args.resolved && (carry.roomId !== roomId || !sameMessengerReadOrderKey(carry.key, args.resolved))) {
    setCarry({ roomId, key: args.resolved });
  } else if (!args.resolved && carry.roomId !== roomId) {
    setCarry({ roomId, key: null });
  }
  return carryDirectPeerReadCursorKey({ resolved: args.resolved, cursorId: args.cursorId, previous });
}
