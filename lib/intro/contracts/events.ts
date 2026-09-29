/**
 * DIBAY INTRO — Phase 1
 * Shared semantic event / handoff contracts.
 */

export const IntroEvent = {
  FIRST_FRAME_READY: "INTRO_FIRST_FRAME_READY",
  COMPLETED: "INTRO_COMPLETED",
  ABANDONED_BY_CALL: "INTRO_ABANDONED_BY_CALL",
  FAILED_OPEN: "INTRO_FAILED_OPEN",
} as const;
export type IntroEventName = (typeof IntroEvent)[keyof typeof IntroEvent];

/** Meaningful Home presentation ready for ownership handoff. Not dismissSplash / shellReady. */
export const HomeEvent = {
  PRESENTATION_READY: "HOME_PRESENTATION_READY",
} as const;
export type HomeEventName = (typeof HomeEvent)[keyof typeof HomeEvent];

export type IntroSessionEvent =
  | { type: typeof IntroEvent.FIRST_FRAME_READY }
  | { type: typeof IntroEvent.COMPLETED; routeId?: string }
  | { type: typeof IntroEvent.ABANDONED_BY_CALL }
  | { type: typeof IntroEvent.FAILED_OPEN; reason: string };

export type HomePresentationReadyEvent = {
  type: typeof HomeEvent.PRESENTATION_READY;
};
