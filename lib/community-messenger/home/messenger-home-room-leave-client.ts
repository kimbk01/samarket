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
import { communityMessengerGroupRoomApiPath } from "@/lib/community-messenger/group/group-room-deeplink";
import { applyHomeListPatch, commitHomeListPatch } from "@/lib/community-messenger/home-list-patch";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import { invalidateRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
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

export function applyMessengerHomeRoomLeaveSuccess(
  roomId: string,
  setData?: Dispatch<SetStateAction<CommunityMessengerBootstrap | null>>
): void {
  const rid = trimRoomId(roomId);
  if (!rid) return;
  if (setData) {
    commitHomeListPatch(setData, { kind: "remove_room", roomId: rid }, "bootstrap");
  }
  syncMessengerHomeAfterRoomLeave(rid);
}

export async function requestLeaveMessengerRoomClient(
  roomId: string,
  roomType: CommunityMessengerRoomSummary["roomType"]
): Promise<LeaveMessengerRoomClientResult> {
  const rid = trimRoomId(roomId);
  if (!rid) return { ok: false, error: "room_not_found" };

  if (roomType === "private_group") {
    const res = await fetch(`${communityMessengerGroupRoomApiPath(rid)}/participants`, {
      method: "DELETE",
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string };
    if (!res.ok || !json.ok) {
      return { ok: false, error: parseLeaveApiError(json), status: res.status };
    }
    return { ok: true };
  }

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
}): Promise<LeaveMessengerRoomClientResult> {
  const result = await requestLeaveMessengerRoomClient(input.roomId, input.roomType);
  if (!result.ok) return result;
  applyMessengerHomeRoomLeaveSuccess(input.roomId, input.setData);
  return { ok: true };
}
