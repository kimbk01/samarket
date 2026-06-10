/**
 * DiBaY 로그인 후 1회 온보딩 모달 결정 저장 (알림·통화 미디어 등).
 * 키: `dibay.permission.{userId}.{deviceId}.{promptId}.onboarding`
 * — device-permission-manager 의 `.status` / `.guideSeen` 과 별도(「앱 모달에서 봤는지」).
 * 브라우저 실제 허용은 OS·브라우저가 유지; 여기는 재노출 방지·설정 연동용.
 */
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";

const ANONYMOUS_PERMISSION_USER_ID = "anonymous";
const STABLE_CLIENT_ID_KEY = "dibay.device.stableClientId";

export type DiBaYOnboardingPromptId = "notification" | "call_media";

export type DiBaYOnboardingPromptState = "accepted" | "declined" | "browser_denied";

function sanitizePermissionKeyPart(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "unknown";
  return encodeURIComponent(trimmed).replace(/\./g, "%2E");
}

function onboardingStorageKey(userId: string, deviceId: string, promptId: DiBaYOnboardingPromptId): string {
  return `dibay.permission.${userId}.${deviceId}.${promptId}.onboarding`;
}

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

function getDiBaYStableClientId(): string {
  if (typeof window === "undefined") return "server";
  const existing = readLs(STABLE_CLIENT_ID_KEY)?.trim();
  if (existing) return existing;
  const next =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  writeLs(STABLE_CLIENT_ID_KEY, next);
  return next;
}

function getStorageScope(): { userId: string; deviceId: string } {
  const userId = sanitizePermissionKeyPart(getSyncViewerUserIdForClient() ?? ANONYMOUS_PERMISSION_USER_ID);
  const deviceId = sanitizePermissionKeyPart(getDiBaYStableClientId());
  return { userId, deviceId };
}

/** 로그인 전 anonymous 키에 저장된 온보딩 결정을 실제 userId 로 승격 */
function promoteAnonymousOnboardingIfNeeded(promptId: DiBaYOnboardingPromptId): void {
  const { userId, deviceId } = getStorageScope();
  const anonUserId = sanitizePermissionKeyPart(ANONYMOUS_PERMISSION_USER_ID);
  if (userId === anonUserId) return;
  const anonKey = onboardingStorageKey(anonUserId, deviceId, promptId);
  const userKey = onboardingStorageKey(userId, deviceId, promptId);
  const anonVal = readLs(anonKey);
  if (!anonVal) return;
  if (!readLs(userKey)) {
    writeLs(userKey, anonVal);
  }
}

export function readDiBaYOnboardingPromptState(promptId: DiBaYOnboardingPromptId): DiBaYOnboardingPromptState | null {
  if (typeof window === "undefined") return null;
  promoteAnonymousOnboardingIfNeeded(promptId);
  const { userId, deviceId } = getStorageScope();
  const raw = readLs(onboardingStorageKey(userId, deviceId, promptId));
  if (raw === "accepted" || raw === "declined" || raw === "browser_denied") {
    return raw;
  }
  return null;
}

export function writeDiBaYOnboardingPromptState(
  promptId: DiBaYOnboardingPromptId,
  state: DiBaYOnboardingPromptState,
): void {
  if (typeof window === "undefined") return;
  const { userId, deviceId } = getStorageScope();
  writeLs(onboardingStorageKey(userId, deviceId, promptId), state);
}

export function shouldOfferDiBaYOnboardingPrePrompt(promptId: DiBaYOnboardingPromptId): boolean {
  return readDiBaYOnboardingPromptState(promptId) === null;
}

export function resetDiBaYOnboardingPrompt(promptId: DiBaYOnboardingPromptId): void {
  if (typeof window === "undefined") return;
  const { userId, deviceId } = getStorageScope();
  removeLs(onboardingStorageKey(userId, deviceId, promptId));
  const anonUserId = sanitizePermissionKeyPart(ANONYMOUS_PERMISSION_USER_ID);
  removeLs(onboardingStorageKey(anonUserId, deviceId, promptId));
}

export function resetAllDiBaYOnboardingPrompts(): void {
  const ids: DiBaYOnboardingPromptId[] = ["notification", "call_media"];
  for (const id of ids) {
    resetDiBaYOnboardingPrompt(id);
  }
}
