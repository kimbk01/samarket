"use client";

/**
 * 기기별 clientInstanceId + 마지막 로그인 userId 바인딩.
 * clientInstanceId 는 로그아웃 후에도 유지(기기 식별).
 */

export const DIBAY_CLIENT_INSTANCE_ID_KEY = "dibay:client_instance_id";
export const DIBAY_AUTH_BOUND_USER_ID_KEY = "dibay:auth_bound_user_id";

/** wipe 시 localStorage allowlist — client-session-wipe 와 공유 */
export const CLIENT_INSTANCE_PERSISTENT_KEYS = [
  DIBAY_CLIENT_INSTANCE_ID_KEY,
] as const;

function readLs(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLs(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function removeLs(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function ensureClientInstanceId(): string {
  const existing = readLs(DIBAY_CLIENT_INSTANCE_ID_KEY)?.trim();
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `dibay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  writeLs(DIBAY_CLIENT_INSTANCE_ID_KEY, id);
  return id;
}

export function getBoundAuthUserId(): string | null {
  const v = readLs(DIBAY_AUTH_BOUND_USER_ID_KEY)?.trim();
  return v || null;
}

export function bindAuthUserId(userId: string): void {
  const id = String(userId ?? "").trim();
  if (!id) return;
  ensureClientInstanceId();
  writeLs(DIBAY_AUTH_BOUND_USER_ID_KEY, id);
}

export function clearBoundAuthUserId(): void {
  removeLs(DIBAY_AUTH_BOUND_USER_ID_KEY);
}

/** 이전 bound userId 와 다르면 true (첫 로그인·bound 없음은 false) */
export function detectAuthUserMismatch(nextUserId: string): boolean {
  const next = String(nextUserId ?? "").trim();
  if (!next) return false;
  const bound = getBoundAuthUserId();
  if (!bound) return false;
  return bound !== next;
}
