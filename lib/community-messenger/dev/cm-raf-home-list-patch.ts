"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  resolveMessengerHomeBootstrapSetData,
  type CmHomeSetDataSource,
} from "@/lib/community-messenger/dev/cm-event-loop-dev";
import { deferCmRoomListRenderUpdate } from "@/lib/community-messenger/room/cm-room-list-render-pause";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";

type CmHomeListPatchMutator = {
  mutate: (prev: CommunityMessengerBootstrap) => CommunityMessengerBootstrap | null;
  source: CmHomeSetDataSource;
};

const CM_HOME_LIST_PATCH_MAX_MUTATORS_PER_FRAME = 8;
const CM_HOME_LIST_PATCH_FRAME_BUDGET_MS = 16;

/**
 * 홈 부트스트랩 `setData` — 프레임당 1회 commit 으로 Realtime·bus·unread 패치 병합.
 * semantics: mutator 순서 유지, 동일 프레임 내 여러 패치는 단일 setState 로 합침.
 * 대형 burst 는 frame budget 초과 시 다음 rAF 로 분할.
 */
export function createCmHomeListRafPatchScheduler(
  setData: Dispatch<SetStateAction<CommunityMessengerBootstrap | null>>
): (
  mutate: (prev: CommunityMessengerBootstrap) => CommunityMessengerBootstrap | null,
  source?: CmHomeSetDataSource
) => void {
  let rafId: number | null = null;
  const mutators: CmHomeListPatchMutator[] = [];

  const scheduleFlush = () => {
    if (rafId != null) return;
    rafId = requestAnimationFrame(flush);
  };

  const flush = () => {
    rafId = null;
    if (mutators.length === 0) return;

    const takeCount = Math.min(mutators.length, CM_HOME_LIST_PATCH_MAX_MUTATORS_PER_FRAME);
    const batch = mutators.splice(0, takeCount);
    let deferredRest: typeof batch = [];

    setData((prev) => {
      if (!prev) return prev;
      let cur: CommunityMessengerBootstrap = prev;
      let lastSource: CmHomeSetDataSource = "bus";
      const frameStart = typeof performance !== "undefined" ? performance.now() : 0;
      let consumed = 0;
      for (const entry of batch) {
        lastSource = entry.source;
        const next = entry.mutate(cur);
        if (next == null) return prev;
        if (next !== cur) {
          cur = next;
        }
        consumed += 1;
        if (
          consumed < batch.length &&
          typeof performance !== "undefined" &&
          performance.now() - frameStart > CM_HOME_LIST_PATCH_FRAME_BUDGET_MS
        ) {
          deferredRest = batch.slice(consumed);
          break;
        }
      }
      if (deferredRest.length > 0) {
        mutators.unshift(...deferredRest);
      }
      if (mutators.length > 0) scheduleFlush();
      return resolveMessengerHomeBootstrapSetData(lastSource, prev, cur === prev ? prev : cur, {
        reason: "raf_patch_batch",
      });
    });
  };

  return (mutate, source = "bus") => {
    deferCmRoomListRenderUpdate(() => {
      mutators.push({ mutate, source });
      scheduleFlush();
    });
  };
}
