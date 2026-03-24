/**
 * 테스트용 단순 로그인 (아이디/비밀번호) - sessionStorage 사용
 * 같은 PC라도 탭/창마다 다른 sessionStorage → 다른 아이디로 테스트 가능
 * 테스트 후 삭제
 */

import { KASAMA_DEV_UID_PUB_COOKIE } from "@/lib/auth/dev-session-cookie";

const KEY_USER_ID = "test_user_id";
const KEY_USERNAME = "test_username";
const KEY_ROLE = "test_role";

/** 테스트 로그인 변경 시 마이페이지 등에서 `getCurrentUser()` 재동기화용 */
export const TEST_AUTH_CHANGED_EVENT = "kasama-test-auth-changed";

export function dispatchTestAuthChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(TEST_AUTH_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

export function getTestAuth(): { userId: string; username: string; role: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const userId = sessionStorage.getItem(KEY_USER_ID);
    const username = sessionStorage.getItem(KEY_USERNAME);
    const role = sessionStorage.getItem(KEY_ROLE);
    if (userId && username) return { userId, username, role: role || "member" };
  } catch {}
  return null;
}

function syncDevPubCookie(userId: string | null): void {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") return;
  try {
    if (userId) {
      document.cookie = `${KASAMA_DEV_UID_PUB_COOKIE}=${encodeURIComponent(userId)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
    } else {
      document.cookie = `${KASAMA_DEV_UID_PUB_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    }
  } catch {
    /* ignore */
  }
}

export function setTestAuth(userId: string, username: string, role: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY_USER_ID, userId);
    sessionStorage.setItem(KEY_USERNAME, username);
    sessionStorage.setItem(KEY_ROLE, role);
    syncDevPubCookie(userId);
    dispatchTestAuthChanged();
  } catch {}
}

export function clearTestAuth(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY_USER_ID);
    sessionStorage.removeItem(KEY_USERNAME);
    sessionStorage.removeItem(KEY_ROLE);
    syncDevPubCookie(null);
    dispatchTestAuthChanged();
  } catch {}
}
