/**
 * DIBAY 세션·로그아웃 정책 — 단일 정의.
 * @see docs/dibay-session-policy.md
 */

import { APP_LANGUAGE_DEVICE_SEEDED_KEY, APP_LANGUAGE_STORAGE_KEY } from "@/lib/i18n/config";
import { DIBAY_CLIENT_INSTANCE_ID_KEY } from "@/lib/auth/client-instance-id";

/** Supabase refresh token / JWT 가 확실히 무효일 때만 hard logout */
export const DIBAY_TERMINAL_AUTH_CODES = new Set([
  "bad_jwt",
  "session_not_found",
  "session_expired",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "user_not_found",
  "no_authorization",
]);

/** user_sessions.invalidation_reason — hard logout 트리거 */
export const DIBAY_TERMINAL_SESSION_INVALIDATION_REASONS = new Set([
  "user_logout",
  "admin_revoke",
  "global_signout",
  "account_deleted",
]);

/** 로그아웃·wipe 후에도 유지하는 localStorage key (기기·언어) */
export const DIBAY_DEVICE_PERSISTENT_STORAGE_KEYS = new Set<string>([
  APP_LANGUAGE_STORAGE_KEY,
  APP_LANGUAGE_DEVICE_SEEDED_KEY,
  DIBAY_CLIENT_INSTANCE_ID_KEY,
]);

export const DIBAY_STORAGE_USER_PREFIX = "dibay:";

/**
 * Session phase SSOT — Telegram/Kakao-style persistence.
 *
 * - authenticated: Supabase session + app profile confirmed; FCM register allowed.
 * - recovering: boot/cold start/cookie race/network delay; never wipe/deactivate.
 * - terminal_guest: explicit logout, account switch, or confirmed fresh install only.
 * - corrupt: terminal refresh-token invalidation only (recover first when possible).
 * - loading: initial unknown before first resolution.
 */
export type DibaySessionPhase =
  | "loading"
  | "authenticated"
  | "recovering"
  | "terminal_guest"
  | "corrupt";

/** @deprecated use terminal_guest — alias for migration reads */
export type DibaySessionPhaseLegacyGuest = "guest";

export function isTerminalGuestPhase(phase: DibaySessionPhase): boolean {
  return phase === "terminal_guest";
}

export function isRecoveringPhase(phase: DibaySessionPhase): boolean {
  return phase === "recovering" || phase === "loading";
}

export function allowsPushRegistration(phase: DibaySessionPhase): boolean {
  return phase === "authenticated";
}

export type SessionEnforcementMode = "multi_device_allow" | "single_device_latest";

/** 현재 제품 기본 — 다중 기기·다중 탭 허용, SESSION_REPLACED 없음 */
export const DIBAY_DEFAULT_SESSION_ENFORCEMENT: SessionEnforcementMode = "multi_device_allow";

export function dibayUserStoragePrefix(userId: string): string {
  const id = String(userId ?? "").trim();
  if (!id) return `${DIBAY_STORAGE_USER_PREFIX}anonymous:`;
  return `${DIBAY_STORAGE_USER_PREFIX}${id}:`;
}

export function dibayUserStorageKey(userId: string, suffix: string): string {
  return `${dibayUserStoragePrefix(userId)}${String(suffix ?? "").trim()}`;
}

export function isDibayDevicePersistentKey(key: string): boolean {
  return DIBAY_DEVICE_PERSISTENT_STORAGE_KEYS.has(key);
}

export function isDibayUserScopedStorageKey(key: string): boolean {
  const k = String(key ?? "").trim();
  if (!k.startsWith(DIBAY_STORAGE_USER_PREFIX)) return false;
  if (k === DIBAY_CLIENT_INSTANCE_ID_KEY) return false;
  const rest = k.slice(DIBAY_STORAGE_USER_PREFIX.length);
  return rest.includes(":");
}

export function listUserScopedStorageKeysForUser(userId: string, storage: Storage): string[] {
  const prefix = dibayUserStoragePrefix(userId);
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(prefix)) keys.push(key);
  }
  return keys;
}

export function isTerminalAuthCode(code: string | null | undefined): boolean {
  const c = String(code ?? "").trim().toLowerCase();
  if (!c) return false;
  return DIBAY_TERMINAL_AUTH_CODES.has(c);
}

export function isTerminalSessionInvalidationReason(reason: string | null | undefined): boolean {
  const r = String(reason ?? "").trim().toLowerCase();
  if (!r) return false;
  return DIBAY_TERMINAL_SESSION_INVALIDATION_REASONS.has(r);
}

/** account switch 시 반드시 청소하는 in-memory·캐시 도메인 (문서용 식별자) */
export const DIBAY_ACCOUNT_SWITCH_WIPE_DOMAINS = [
  "profile_cache",
  "app_boot",
  "me_profile_deduped",
  "messenger_bootstrap",
  "room_snapshots",
  "commerce_cart",
  "trade_drafts",
  "unread_badges",
  "last_route_restore",
  "owner_admin_selection",
  "pending_auth_actions",
  "login_bootstrap",
  "address_defaults",
  "user_settings",
] as const;
