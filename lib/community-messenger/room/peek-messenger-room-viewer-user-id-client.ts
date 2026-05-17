"use client";

import {
  KASAMA_DEV_UID_COOKIE,
  KASAMA_DEV_UID_PUB_COOKIE,
} from "@/lib/auth/dev-session-cookie";
import { isUuidLikeString } from "@/lib/shared/uuid-string";

const E2E_ROOM_DIAG_COOKIE = "samarket_e2e_room_diag";

function readCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";").map((p) => p.trim());
  const prefix = `${name}=`;
  for (const p of parts) {
    if (!p.startsWith(prefix)) continue;
    let v = p.slice(prefix.length).trim();
    try {
      v = decodeURIComponent(v);
    } catch {
      /* keep raw */
    }
    const t = v.trim();
    if (t.length > 0) return t;
  }
  return null;
}

/** HttpOnly 세션은 읽을 수 없음 — pub 미러·bootstrap 이 viewer 를 이어 받는다. */
export function peekMessengerRoomViewerUserIdClient(): string | null {
  const a = readCookieValue(KASAMA_DEV_UID_COOKIE);
  if (a && isUuidLikeString(a)) return a;
  const b = readCookieValue(KASAMA_DEV_UID_PUB_COOKIE);
  if (b && isUuidLikeString(b)) return b;
  return null;
}

/** 비프로덕션 E2E — 서버 `cookies()`/`headers()` 대체 */
export function isMessengerRoomE2eDiagEnabledClient(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return readCookieValue(E2E_ROOM_DIAG_COOKIE) === "1";
}
