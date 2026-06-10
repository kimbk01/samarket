import {
  readDiBaYOnboardingPromptState,
  shouldOfferDiBaYOnboardingPrePrompt,
  writeDiBaYOnboardingPromptState,
  type DiBaYOnboardingPromptState,
} from "@/lib/permissions/dibay-onboarding-prompt-storage";

export type DiBaYCallMediaPromptState = DiBaYOnboardingPromptState;

export function readDiBaYCallMediaPromptState(): DiBaYCallMediaPromptState | null {
  return readDiBaYOnboardingPromptState("call_media");
}

export function writeDiBaYCallMediaPromptState(state: DiBaYCallMediaPromptState): void {
  writeDiBaYOnboardingPromptState("call_media", state);
}

/** 최초 한 번만 프리프롬프트 후보 */
export function shouldOfferCallMediaPrePrompt(): boolean {
  return shouldOfferDiBaYOnboardingPrePrompt("call_media");
}
