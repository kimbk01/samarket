/**
 * 어드민 테스트 로그인 스토리지 (클라이언트 전용)
 */

import { ADMIN_STORAGE_KEY, LOGIN_ID_MAX_LENGTH } from "./constants";

export function getCurrentAdminLoginId(): string | null {
  if (typeof window === "undefined") return null;
  const fromStorage = localStorage.getItem(ADMIN_STORAGE_KEY);
  if (fromStorage) {
    const trimmed = fromStorage.trim();
    return trimmed.length > 0 && trimmed.length <= LOGIN_ID_MAX_LENGTH
      ? trimmed
      : null;
  }
  const v = process.env.NEXT_PUBLIC_ADMIN_LOGIN;
  return v && typeof v === "string" && v.length <= LOGIN_ID_MAX_LENGTH
    ? v.trim()
    : null;
}

export function setAdminTestLoginAndReload(loginId: string | null): void {
  if (typeof window === "undefined") return;
  if (
    loginId &&
    loginId.trim().length > 0 &&
    loginId.length <= LOGIN_ID_MAX_LENGTH
  ) {
    localStorage.setItem(ADMIN_STORAGE_KEY, loginId.trim());
  } else {
    localStorage.removeItem(ADMIN_STORAGE_KEY);
  }
  window.location.reload();
}
