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

/** @deprecated Use PermissionManager syncNotificationState receiveReady — kept for legacy callers. */
export function shouldOfferDiBaYNotificationPrePrompt(): boolean {
  return shouldOfferDiBaYOnboardingPrePrompt("notification");
}
