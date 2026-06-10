import {
  readDiBaYOnboardingPromptState,
  shouldOfferDiBaYOnboardingPrePrompt,
  writeDiBaYOnboardingPromptState,
  type DiBaYOnboardingPromptState,
} from "@/lib/permissions/dibay-onboarding-prompt-storage";

export type DiBaYNotifPromptState = DiBaYOnboardingPromptState;

export function readDiBaYNotificationPromptState(): DiBaYNotifPromptState | null {
  return readDiBaYOnboardingPromptState("notification");
}

export function writeDiBaYNotificationPromptState(state: DiBaYNotifPromptState): void {
  writeDiBaYOnboardingPromptState("notification", state);
}

/** 최초 한 번만 프리프롬프트 후보 (거부·브라우저 거부 시 재노출 안 함) */
export function shouldOfferDiBaYNotificationPrePrompt(): boolean {
  return shouldOfferDiBaYOnboardingPrePrompt("notification");
}
