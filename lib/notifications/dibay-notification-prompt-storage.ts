const STORAGE_KEY = "dibay_notif_onboarding_v1";

export type DiBaYNotifPromptState = "accepted" | "declined" | "browser_denied";

export function readDiBaYNotificationPromptState(): DiBaYNotifPromptState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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
    window.localStorage.setItem(STORAGE_KEY, state);
  } catch {
    /* ignore */
  }
}

/** 최초 한 번만 프리프롬프트 후보 (거부·브라우저 거부 시 재노출 안 함) */
export function shouldOfferDiBaYNotificationPrePrompt(): boolean {
  return readDiBaYNotificationPromptState() === null;
}
