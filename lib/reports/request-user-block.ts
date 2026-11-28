"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { invalidateHomePostsCache } from "@/lib/posts/getPostsForHome";
import {
  reportClientFailure,
  reportClientFailureFromResponse,
  type ReportClientFailure,
} from "@/lib/reports/report-block-error-text";

/** 실패는 코드만 — 문구는 화면이 `userBlockErrorText` 로 고른다 (재감사 2026-11-27) */
export type BlockUserResult = { ok: true } | ReportClientFailure;

/**
 * 사용자 차단 (프로필/채팅방 점3개)
 * SSOT — `/api/community/block-relations` → `user_social_relations`
 */
export async function requestUserBlock(
  targetUserId: string,
  options?: { reason?: string; roomId?: string }
): Promise<BlockUserResult> {
  const user = getCurrentUser();
  if (!user?.id) return reportClientFailure("login_required");
  if (user.id === targetUserId) return reportClientFailure("self_block");

  const result = await blockUserRequest(targetUserId, options);
  /** 차단한 판매자 글이 목록 캐시에 남지 않게 — 서버 목록은 차단 작성자를 제외해 내려준다. */
  if (result.ok) invalidateHomePostsCache();
  return result;
}

async function blockUserRequest(
  targetUserId: string,
  options?: { reason?: string; roomId?: string }
): Promise<BlockUserResult> {
  try {
    if (options?.roomId) {
      const roomRes = await fetch(`/api/chat/rooms/${encodeURIComponent(options.roomId)}/block`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: options.reason ?? null }),
      });
      const roomJson = (await roomRes.json()) as { ok?: boolean; error?: string };
      if (roomRes.ok && roomJson.ok) return { ok: true };
      /** 레거시 `product_chats` 방은 `chat_rooms` 에 없어 404 — 같은 SSOT 차단으로 이어서 처리한다. */
      if (roomRes.status !== 404) {
        return reportClientFailureFromResponse(roomRes.status, roomJson);
      }
    }

    /** 상태 지정 차단 — 이미 차단이면 서버가 그대로 200(사전 GET 확인 불필요, 설계 v2 §5-2) */
    const res = await fetch("/api/community/block-relations", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId, blocked: true }),
    });
    const j = (await res.json()) as { ok?: boolean; blocked?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      return reportClientFailureFromResponse(res.status, j);
    }
  } catch {
    return reportClientFailure("block_failed");
  }

  return { ok: true };
}
