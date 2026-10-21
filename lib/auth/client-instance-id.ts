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

/**
 * P0-2 — 탭별 마지막 인증 user id (메모리 전용 · localStorage 바인딩과 별개).
 * 다른 탭의 로그아웃이 bound id 를 지우고 B 로그인이 다시 쓰면 `detectAuthUserMismatch` 는 false 가 된다.
 * 이 탭 메모리에 A 상태가 남아 있는지는 이 값으로만 판단한다. SIGNED_OUT 에서 지우지 않는다.
 */
let tabAuthenticatedUserId: string | null = null;

export function rememberTabAuthenticatedUserId(userId: string): void {
  const id = String(userId ?? "").trim();
  if (!id) return;
  tabAuthenticatedUserId = id;
}

export function getTabAuthenticatedUserId(): string | null {
  return tabAuthenticatedUserId;
}

/** 이 탭이 이전에 다른 user 로 인증돼 있었으면 true (탭 첫 인증은 false) */
export function detectTabAuthUserSwitch(nextUserId: string): boolean {
  const next = String(nextUserId ?? "").trim();
  if (!next || !tabAuthenticatedUserId) return false;
  return tabAuthenticatedUserId !== next;
}

/** vitest */
export function resetTabAuthenticatedUserIdForTests(): void {
  tabAuthenticatedUserId = null;
}
