"use client";

import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import { pickMessengerApiErrorField } from "@/lib/community-messenger/room/messenger-room-action-error-messages";

export type MessengerRoomAuthRouterLike = { push: (href: string) => void };

/**
 * 메신저 방 API 실패 시 로그인·전화 인증 필요 응답이면 스낵바 대신 전역 다이얼로그/이동 처리.
 */
export function tryRedirectMessengerRoomAuthBlocked(
  router: MessengerRoomAuthRouterLike,
  res: Response,
  json: { error?: unknown; code?: unknown },
  opts: { pathname: string; streamRoomId?: string | null }
): boolean {
  const picked = pickMessengerApiErrorField(json);
  const errText =
    picked ||
    (typeof json.error === "string" && json.error.trim() ? json.error.trim() : "") ||
    (res.status === 401 ? "로그인이 필요합니다." : "");
  const path = (opts.pathname ?? "").trim();
  const next =
    path.startsWith("/community-messenger") && path.length > 0
      ? `${path}${typeof window !== "undefined" ? window.location.search : ""}`
      : opts.streamRoomId?.trim()
        ? `/community-messenger/rooms/${encodeURIComponent(opts.streamRoomId.trim())}`
        : "/community-messenger";
  return redirectForBlockedAction(router, errText || undefined, next);
}
