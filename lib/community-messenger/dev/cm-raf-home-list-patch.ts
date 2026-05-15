"use client";

import type { Dispatch, SetStateAction } from "react";
import { deferCmRoomListRenderUpdate } from "@/lib/community-messenger/room/cm-room-list-render-pause";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";

/**
 * 홈 부트스트랩 `setData` — 프레임당 1회 commit 으로 Realtime·bus·unread 패치 병합.
 * semantics: mutator 순서 유지, 동일 프레임 내 여러 패치는 단일 setState 로 합침.
 */
export function createCmHomeListRafPatchScheduler(
  setData: Dispatch<SetStateAction<CommunityMessengerBootstrap | null>>
): (mutate: (prev: CommunityMessengerBootstrap) => CommunityMessengerBootstrap | null) => void {
  let rafId: number | null = null;
  const mutators: Array<(prev: CommunityMessengerBootstrap) => CommunityMessengerBootstrap | null> = [];

  const flush = () => {
    rafId = null;
    const batch = mutators.splice(0);
    if (batch.length === 0) return;
    setData((prev) => {
      if (!prev) return prev;
      let cur: CommunityMessengerBootstrap = prev;
      let changed = false;
      for (const m of batch) {
        const next = m(cur);
        if (next == null) return prev;
        if (next !== cur) {
          cur = next;
          changed = true;
        }
      }
      return changed ? cur : prev;
    });
  };

  return (mutate) => {
    deferCmRoomListRenderUpdate(() => {
      mutators.push(mutate);
      if (rafId != null) return;
      rafId = requestAnimationFrame(flush);
    });
  };
}
