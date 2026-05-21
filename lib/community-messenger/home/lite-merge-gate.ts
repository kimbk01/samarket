"use client";

/**
 * lite bootstrap `setData` 구간 — home-sync·background hydration patch 가 겹치지 않게 지연·coalesce.
 * unread/realtime 의미는 바꾸지 않고 실행 시점만 조율한다.
 */

export type DeferredHomeSyncPayload = {
  chats?: import("@/lib/community-messenger/types").CommunityMessengerRoomSummary[];
  groups?: import("@/lib/community-messenger/types").CommunityMessengerRoomSummary[];
  requests?: import("@/lib/community-messenger/types").CommunityMessengerBootstrap["requests"];
  friends?: import("@/lib/community-messenger/types").CommunityMessengerProfileLite[];
  roomMode?: "replace" | "critical_patch";
};

type DeferredHomeSyncApply = (payload: DeferredHomeSyncPayload) => void;

let liteMergeActive = false;
let liteMergeComplete = true;
let hydrationOverlap = false;
const deferredHomeSyncQueue: DeferredHomeSyncPayload[] = [];
let deferredApplyRunner: DeferredHomeSyncApply | null = null;

export function beginLiteClientMergeGate(): void {
  liteMergeActive = true;
  liteMergeComplete = false;
  hydrationOverlap = false;
}

export function endLiteClientMergeGate(): void {
  liteMergeActive = false;
  liteMergeComplete = true;
  flushDeferredHomeSyncPatches();
}

export function isLiteClientMergeGateActive(): boolean {
  return liteMergeActive;
}

export function wasHydrationOverlapDuringLiteMerge(): boolean {
  return hydrationOverlap;
}

export function registerDeferredHomeSyncRunner(run: DeferredHomeSyncApply): void {
  deferredApplyRunner = run;
}

export function deferHomeSyncPatchDuringLiteMerge(payload: DeferredHomeSyncPayload): boolean {
  if (!liteMergeActive) return false;
  hydrationOverlap = true;
  const last = deferredHomeSyncQueue[deferredHomeSyncQueue.length - 1];
  if (last) {
    deferredHomeSyncQueue[deferredHomeSyncQueue.length - 1] = {
      chats: payload.chats ?? last.chats,
      groups: payload.groups ?? last.groups,
      requests: payload.requests ?? last.requests,
      friends: payload.friends ?? last.friends,
      roomMode: payload.roomMode ?? last.roomMode,
    };
  } else {
    deferredHomeSyncQueue.push(payload);
  }
  return true;
}

function flushDeferredHomeSyncPatches(): void {
  if (!deferredApplyRunner || deferredHomeSyncQueue.length === 0) return;
  const merged: DeferredHomeSyncPayload = {};
  for (const p of deferredHomeSyncQueue) {
    if (p.chats !== undefined) merged.chats = p.chats;
    if (p.groups !== undefined) merged.groups = p.groups;
    if (p.requests !== undefined) merged.requests = p.requests;
    if (p.friends !== undefined) merged.friends = p.friends;
    if (p.roomMode !== undefined) merged.roomMode = p.roomMode;
  }
  deferredHomeSyncQueue.length = 0;
  deferredApplyRunner(merged);
}

/** lite merge 완료 전 silent refresh·discoverable follow-up 을 지연할 때 */
export function shouldDeferPostLiteFollowUp(): boolean {
  return liteMergeActive || !liteMergeComplete;
}

export function markLiteMergeFollowUpsUnblocked(): void {
  liteMergeComplete = true;
}
