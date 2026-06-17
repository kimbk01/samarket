"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";

export type BlockUserResult = { ok: true } | { ok: false; error: string };

/**
 * 당근형: 사용자 차단 (프로필/채팅방 점3개)
 * SSOT — `/api/community/block-relations` → `user_social_relations`
 */
export async function blockUserDaangn(
  targetUserId: string,
  options?: { reason?: string; roomId?: string }
): Promise<BlockUserResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };
  if (user.id === targetUserId) return { ok: false, error: "자기 자신은 차단할 수 없습니다." };

  try {
    if (options?.roomId) {
      const roomRes = await fetch(`/api/chat/rooms/${encodeURIComponent(options.roomId)}/block`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: options.reason ?? null }),
      });
      const roomJson = (await roomRes.json()) as { ok?: boolean; error?: string };
      if (!roomRes.ok || !roomJson.ok) {
        return { ok: false, error: roomJson.error ?? "차단에 실패했습니다." };
      }
      return { ok: true };
    }

    const checkRes = await fetch(
      `/api/community/block-relations?targetUserId=${encodeURIComponent(targetUserId)}`,
      { credentials: "include", cache: "no-store" }
    );
    const check = (await checkRes.json()) as { ok?: boolean; blocked?: boolean };
    if (checkRes.ok && check.ok && check.blocked === true) {
      return { ok: true };
    }

    const res = await fetch("/api/community/block-relations", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId }),
    });
    const j = (await res.json()) as { ok?: boolean; blocked?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      return { ok: false, error: j.error ?? "차단에 실패했습니다." };
    }
  } catch {
    return { ok: false, error: "차단에 실패했습니다." };
  }

  return { ok: true };
}
