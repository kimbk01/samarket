"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  peekBootstrapCache,
  peekMessengerBootstrapCritical,
  peekMessengerBootstrapMinimal,
  primeBootstrapCache,
  primeMessengerBootstrapCritical,
  primeMessengerBootstrapMinimal,
} from "@/lib/community-messenger/bootstrap-cache";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import { applyHomeListPatch, commitHomeListPatch } from "@/lib/community-messenger/home-list-patch";
import type { MessengerHomeShadowDispatch } from "@/lib/community-messenger/home/inbox-pipeline/shadow";
import { invalidateRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerBootstrapCritical,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

export type LeaveMessengerRoomClientResult =
  | { ok: true }
  | { ok: false; error?: string; status?: number };

function trimRoomId(roomId: string): string {
  return roomId.trim();
}

function parseLeaveApiError(json: { error?: string; code?: string }): string | undefined {
  const code = typeof json.code === "string" ? json.code.trim() : "";
  if (code) return code;
  const err = typeof json.error === "string" ? json.error.trim() : "";
  return err || undefined;
}

function removeRoomFromBootstrapSnapshot(
  snapshot: CommunityMessengerBootstrap | null,
  roomId: string
): CommunityMessengerBootstrap | null {
  if (!snapshot) return null;
  return applyHomeListPatch(snapshot, { kind: "remove_room", roomId }, "multi-tab");
}

function removeRoomFromCriticalSnapshot(
  snapshot: CommunityMessengerBootstrapCritical | null,
  roomId: string
): CommunityMessengerBootstrapCritical | null {
  if (!snapshot) return null;
  const drop = (rows: CommunityMessengerBootstrapCritical["chats"]) =>
    rows.filter((row) => row.room_id !== roomId);
  const nextChats = drop(snapshot.chats);
  const nextGroups = drop(snapshot.groups);
  if (nextChats.length === snapshot.chats.length && nextGroups.length === snapshot.groups.length) {
    return snapshot;
  }
  return {
    ...snapshot,
    chats: nextChats,
    groups: nextGroups,
    tabs: { chats: nextChats.length, groups: nextGroups.length },
  };
}

/** Leave 성공 후 bootstrap 캐시·room snapshot — tombstone 없이 remove_room reducer만 사용 */
export function syncMessengerHomeAfterRoomLeave(roomId: string): void {
  const rid = trimRoomId(roomId);
  if (!rid) return;

  for (const [peek, prime] of [
    [peekBootstrapCache, primeBootstrapCache],
    [peekMessengerBootstrapMinimal, primeMessengerBootstrapMinimal],
  ] as const) {
    const cached = peek();
    const next = removeRoomFromBootstrapSnapshot(cached, rid);
    if (next && next !== cached) {
      prime(next);
    }
  }

  const critical = peekMessengerBootstrapCritical();
  const nextCritical = removeRoomFromCriticalSnapshot(critical, rid);
  if (nextCritical && nextCritical !== critical) {
    primeMessengerBootstrapCritical(nextCritical);
  }

  invalidateRoomSnapshot(rid);
}

/**
 * §17 R-1: 방 화면에서 차단 성공 → 서버가 숨긴 1:1 방(`hiddenRoomIds`)을 홈 목록·캐시에서 즉시 뺀다.
 * (홈의 차단은 `remove_room` 을 하지만 방 화면 차단은 하지 않아, 앱 재시작 전까지 목록에 남았다 — 2026-10-25 22:23 PHT 실기기)
 * 같은 탭 홈(마운트 중)·다른 탭은 bus `cm.home.remove_room` 로, 다시 마운트되는 홈은 정리된 캐시로 반영된다.
 */
export function applyMessengerHomeRoomsHiddenByBlock(hiddenRoomIds: unknown): void {
  if (!Array.isArray(hiddenRoomIds)) return;
  for (const raw of hiddenRoomIds) {
    const rid = typeof raw === "string" ? trimRoomId(raw) : "";
    if (!rid) continue;
    syncMessengerHomeAfterRoomLeave(rid);
    postCommunityMessengerBusEvent({
      type: "cm.home.remove_room",
      roomId: rid,
      reason: "blocked_hidden",
      at: Date.now(),
    });
  }
}

export function applyMessengerHomeRoomLeaveSuccess(
  roomId: string,
  setData?: Dispatch<SetStateAction<CommunityMessengerBootstrap | null>>,
  shadowDispatch?: MessengerHomeShadowDispatch
): void {
  const rid = trimRoomId(roomId);
  if (!rid) return;
  shadowDispatch?.dispatchRemove("multi_tab", 1, rid, "leave");
  if (setData) {
    commitHomeListPatch(setData, { kind: "remove_room", roomId: rid }, "bootstrap");
  }
  syncMessengerHomeAfterRoomLeave(rid);
}

export async function requestLeaveMessengerRoomClient(
  roomId: string,
  _roomType: CommunityMessengerRoomSummary["roomType"]
): Promise<LeaveMessengerRoomClientResult> {
  const rid = trimRoomId(roomId);
  if (!rid) return { ok: false, error: "room_not_found" };

  const res = await fetch(`${communityMessengerRoomResourcePath(rid)}/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quiet: false }),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string };
  if (!res.ok || !json.ok) {
    return { ok: false, error: parseLeaveApiError(json), status: res.status };
  }
  return { ok: true };
}

export async function leaveMessengerRoomFromHomeClient(input: {
  roomId: string;
  roomType: CommunityMessengerRoomSummary["roomType"];
  setData?: Dispatch<SetStateAction<CommunityMessengerBootstrap | null>>;
  shadowDispatch?: MessengerHomeShadowDispatch;
}): Promise<LeaveMessengerRoomClientResult> {
  const result = await requestLeaveMessengerRoomClient(input.roomId, input.roomType);
  if (!result.ok) return result;
  applyMessengerHomeRoomLeaveSuccess(input.roomId, input.setData, input.shadowDispatch);
  return { ok: true };
}
