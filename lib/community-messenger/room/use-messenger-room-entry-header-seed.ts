"use client";

import { useMemo } from "react";
import type { CommunityMessengerRoomShellHeaderSeed } from "@/components/community-messenger/room/CommunityMessengerRoomShellChromeFrame";
import { getRoomEntryIntent } from "@/lib/community-messenger/room/messenger-room-entry-intent";

const stickyHeaderSeedCache = new Map<string, CommunityMessengerRoomShellHeaderSeed>();

function seedHasDisplayValue(seed: CommunityMessengerRoomShellHeaderSeed | null | undefined): boolean {
  if (!seed) return false;
  return Boolean(seed.title?.trim() || seed.avatarUrl?.trim());
}

/** handoff `clearRoomEntryIntent` 이후에도 동일 방 header seed 유지 */
export function readMessengerRoomEntryHeaderSeed(roomId: string): CommunityMessengerRoomShellHeaderSeed | null {
  const id = roomId.trim();
  if (!id) return null;

  const intentSeed = getRoomEntryIntent(id)?.seed;
  if (seedHasDisplayValue(intentSeed)) {
    const next: CommunityMessengerRoomShellHeaderSeed = {
      title: intentSeed?.title ?? null,
      avatarUrl: intentSeed?.avatarUrl ?? null,
    };
    stickyHeaderSeedCache.set(id, next);
    return next;
  }

  const cached = stickyHeaderSeedCache.get(id);
  return seedHasDisplayValue(cached) ? cached! : null;
}

export function releaseMessengerRoomEntryHeaderSeedCache(roomId?: string): void {
  const id = roomId?.trim();
  if (!id) {
    stickyHeaderSeedCache.clear();
    return;
  }
  stickyHeaderSeedCache.delete(id);
}

export function useMessengerRoomEntryHeaderSeed(roomId: string): CommunityMessengerRoomShellHeaderSeed | null {
  const id = roomId.trim();
  return useMemo(() => readMessengerRoomEntryHeaderSeed(id), [id]);
}

export function __resetMessengerRoomEntryHeaderSeedCacheForTest(): void {
  stickyHeaderSeedCache.clear();
}
