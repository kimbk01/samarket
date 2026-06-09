import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import { getDiBaYStableClientId } from "@/lib/permissions/device-permission-manager";

const ANONYMOUS_PERMISSION_USER_ID = "anonymous";

export type DiBaYCallMediaPromptState = "accepted" | "declined" | "browser_denied";

function sanitizePermissionKeyPart(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "unknown";
  return encodeURIComponent(trimmed).replace(/\./g, "%2E");
}

function storageKey(): string {
  const userId = sanitizePermissionKeyPart(getSyncViewerUserIdForClient() ?? ANONYMOUS_PERMISSION_USER_ID);
  const deviceId = sanitizePermissionKeyPart(getDiBaYStableClientId());
  return `dibay.permission.${userId}.${deviceId}.call_media.onboarding`;
}

export function readDiBaYCallMediaPromptState(): DiBaYCallMediaPromptState | null {
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

export function writeDiBaYCallMediaPromptState(state: DiBaYCallMediaPromptState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(), state);
  } catch {
    /* ignore */
  }
}

/** 최초 한 번만 프리프롬프트 후보 */
export function shouldOfferCallMediaPrePrompt(): boolean {
  return readDiBaYCallMediaPromptState() === null;
}
