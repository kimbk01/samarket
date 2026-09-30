/**
 * REBUILD 14 P4 — Intro visibility ladder (do not collapse).
 * Timeline begins ONLY after INTRO_OWNER_VISIBLE.
 */

export const INTRO_VISIBILITY_LADDER = [
  "INTRO_IR_READY",
  "INTRO_RENDER_READY",
  "INTRO_PAINTABLE",
  "INTRO_FIRST_MEANINGFUL_FRAME_COMMITTED",
  "INTRO_OWNER_VISIBLE",
  "INTRO_TIMELINE_RUNNING",
] as const;

export type IntroVisibilityStep = (typeof INTRO_VISIBILITY_LADDER)[number];

const ORDER: Readonly<Record<IntroVisibilityStep, number>> = {
  INTRO_IR_READY: 0,
  INTRO_RENDER_READY: 1,
  INTRO_PAINTABLE: 2,
  INTRO_FIRST_MEANINGFUL_FRAME_COMMITTED: 3,
  INTRO_OWNER_VISIBLE: 4,
  INTRO_TIMELINE_RUNNING: 5,
};

export function introVisibilityRank(step: IntroVisibilityStep): number {
  return ORDER[step];
}

export function canAdvanceIntroVisibility(
  from: IntroVisibilityStep,
  to: IntroVisibilityStep,
): boolean {
  return ORDER[to] === ORDER[from] + 1;
}

/**
 * Owner-visible Intro on device is NOT_PROVEN while hosts remain unwired.
 * Structural readiness may reach FRAME_COMMITTED; OWNER_VISIBLE requires host attach.
 */
export const INTRO_OWNER_VISIBLE_DEVICE_PROVEN = false as const;
