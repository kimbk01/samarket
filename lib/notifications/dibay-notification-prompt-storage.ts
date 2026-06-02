import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import { getDiBaYStableClientId } from "@/lib/permissions/device-permission-manager";

const ANONYMOUS_PERMISSION_USER_ID = "anonymous";

export type DiBaYNotifPromptState = "accepted" | "declined" | "browser_denied";

function sanitizePermissionKeyPart(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "unknown";
  return encodeURIComponent(trimmed).replace(/\./g, "%2E");
}

function storageKey(): string {
  const userId = sanitizePermissionKeyPart(getSyncViewerUserIdForClient() ?? ANONYMOUS_PERMISSION_USER_ID);
  const deviceId = sanitizePermissionKeyPart(getDiBaYStableClientId());
  return `dibay.permission.${userId}.${deviceId}.notification.onboarding`;
}

export function readDiBaYNotificationPromptState(): DiBaYNotifPromptState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey());
    if (raw === "accepted" || raw === "declined" || raw === "browser_denied") {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function writeDiBaYNotificationPromptState(state: DiBaYNotifPromptState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(), state);
  } catch {
    /* ignore */
  }
}

/** 최초 한 번만 프리프롬프트 후보 (거부·브라우저 거부 시 재노출 안 함) */
export function shouldOfferDiBaYNotificationPrePrompt(): boolean {
  return readDiBaYNotificationPromptState() === null;
}
