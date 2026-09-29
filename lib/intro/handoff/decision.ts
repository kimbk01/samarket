/**
 * DIBAY INTRO — Phase 1
 * Pure handoff decision + Call abandon semantics.
 * No Call product code touched.
 */

import { IntroEvent } from "../contracts/events";
import { HomeEvent } from "../contracts/events";

export type HandoffInput = {
  readonly introCompleted: boolean;
  readonly homePresentationReady: boolean;
};

export type HandoffDecision =
  | { readonly action: "KEEP_INTRO" }
  | { readonly action: "HOLD_FINAL_INTRO_FRAME" }
  | { readonly action: "HANDOFF_HOME" };

/**
 * if Intro not completed: KEEP INTRO
 * if Intro completed && Home not ready: HOLD FINAL INTRO FRAME
 * if Intro completed && Home ready: HANDOFF HOME
 * No blank intermediate state.
 */
export function decideHandoff(input: HandoffInput): HandoffDecision {
  if (!input.introCompleted) {
    return { action: "KEEP_INTRO" };
  }
  if (!input.homePresentationReady) {
    return { action: "HOLD_FINAL_INTRO_FRAME" };
  }
  return { action: "HANDOFF_HOME" };
}

export type IntroSessionState =
  | { readonly status: "PLAYING" }
  | { readonly status: "COMPLETED" }
  | { readonly status: "ABANDONED_BY_CALL" }
  | { readonly status: "FAILED_OPEN" };

/**
 * Incoming Call displacement → Intro session abandoned.
 * No resume/restart of the same Intro session.
 * After Call lifecycle: normal Home path (semantic only).
 */
export function abandonIntroByCall(
  state: IntroSessionState,
): IntroSessionState {
  if (state.status === "ABANDONED_BY_CALL") return state;
  if (state.status === "COMPLETED") {
    // Already completed — Call does not resurrect Intro session.
    return state;
  }
  return { status: "ABANDONED_BY_CALL" };
}

export function canResumeAbandonedIntroSession(
  state: IntroSessionState,
): false {
  void state;
  return false;
}

export function firstFrameReadyIsNotCompleted(): boolean {
  const first: string = IntroEvent.FIRST_FRAME_READY;
  const completed: string = IntroEvent.COMPLETED;
  return first !== completed;
}

export function homePresentationReadyIsNotDismissSplashAlias(): boolean {
  return HomeEvent.PRESENTATION_READY === "HOME_PRESENTATION_READY";
}
