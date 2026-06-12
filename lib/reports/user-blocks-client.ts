"use client";

import type { BlockedUser } from "@/lib/types/report";
import { blockUserDaangn } from "@/lib/reports/blockUserDaangn";
import { getSupabaseClient } from "@/lib/supabase/client";

type BlockedRelationItem = {
  id: string;
  targetId: string;
  createdAt: string;
  nickname: string | null;
};

const blockedIdsByUser = new Map<string, Set<string>>();
const relationIdByPair = new Map<string, string>();

function pairKey(userId: string, blockedUserId: string): string {
  return `${userId}:${blockedUserId}`;
}

function getSet(userId: string): Set<string> {
  let s = blockedIdsByUser.get(userId);
  if (!s) {
    s = new Set();
    blockedIdsByUser.set(userId, s);
  }
  return s;
}

export function getBlockedUserIds(userId: string): string[] {
  if (!userId) return [];
  return Array.from(getSet(userId));
}

export function getBlockedUsers(userId: string): BlockedUser[] {
  return getBlockedUserIds(userId).map((blockedUserId) => ({
    id: relationIdByPair.get(pairKey(userId, blockedUserId)) ?? `blk-${blockedUserId}`,
    userId,
    blockedUserId,
    blockedUserNickname: undefined,
    createdAt: new Date().toISOString(),
  }));
}

export function isBlocked(userId: string, blockedUserId: string): boolean {
  if (!userId || !blockedUserId) return false;
  return getSet(userId).has(blockedUserId);
}

export async function refreshBlockedUsersFromServer(userId: string): Promise<string[]> {
  if (!userId) return [];
  try {
    const res = await fetch("/api/me/relations/blocked", {
      credentials: "include",
      cache: "no-store",
    });
    const j = (await res.json()) as { ok?: boolean; items?: BlockedRelationItem[] };
    if (!res.ok || !j.ok) return getBlockedUserIds(userId);
    const set = new Set<string>();
    for (const item of j.items ?? []) {
      const targetId = item.targetId?.trim();
      if (!targetId) continue;
      set.add(targetId);
      relationIdByPair.set(pairKey(userId, targetId), item.id);
    }
    blockedIdsByUser.set(userId, set);
    return Array.from(set);
  } catch {
    return getBlockedUserIds(userId);
  }
}

export async function blockUser(
  userId: string,
  blockedUserId: string,
  blockedUserNickname?: string
): Promise<BlockedUser | null> {
  if (!userId || !blockedUserId || userId === blockedUserId) return null;
  const result = await blockUserDaangn(blockedUserId);
  if (!result.ok) return null;
  getSet(userId).add(blockedUserId);
  await refreshBlockedUsersFromServer(userId);
  return {
    id: relationIdByPair.get(pairKey(userId, blockedUserId)) ?? `blk-${Date.now()}`,
    userId,
    blockedUserId,
    blockedUserNickname,
    createdAt: new Date().toISOString(),
  };
}

export async function unblockUser(userId: string, blockedUserId: string): Promise<boolean> {
  if (!userId || !blockedUserId) return false;
  const relationId = relationIdByPair.get(pairKey(userId, blockedUserId));
  if (relationId) {
    try {
      const res = await fetch(
        `/api/me/relations/blocked?id=${encodeURIComponent(relationId)}`,
        { method: "DELETE", credentials: "include" }
      );
      const j = (await res.json()) as { ok?: boolean };
      if (res.ok && j.ok) {
        getSet(userId).delete(blockedUserId);
        relationIdByPair.delete(pairKey(userId, blockedUserId));
        return true;
      }
    } catch {
      /* fall through */
    }
  }

  const supabase = getSupabaseClient();
  if (!supabase) return false;
  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("user_id", userId)
    .eq("blocked_user_id", blockedUserId);
  if (error) return false;
  getSet(userId).delete(blockedUserId);
  relationIdByPair.delete(pairKey(userId, blockedUserId));
  return true;
}
