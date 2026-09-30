/**
 * REBUILD 14 — production presentation activation boundary.
 *
 * P2–P4 shared contracts are structurally present but MUST NOT become
 * Owner-visible until P7 lifecycle bind with valid content.
 *
 * Do not invent a feature-flag maze: one frozen constant.
 */
export const STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE = false as const;

export type StartupCompositorActivation = {
  readonly productionPresentationActive: boolean;
  readonly phase: "P5_CANONICAL_EXECUTION_INTEGRATION";
  readonly note: string;
};

export function getStartupCompositorActivation(): StartupCompositorActivation {
  return {
    productionPresentationActive: STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE,
    phase: "P5_CANONICAL_EXECUTION_INTEGRATION",
    note:
      "P5 canonical geometry/motion/transition/CTA/clock execution SSOT present; " +
      "Production presentation = NO. " +
      "MainActivity / iOS root remain unwired until P7. " +
      "GIF/MP4 native playback = NOT_PROVEN. MP4 audio = OPEN PRODUCT DECISION. " +
      "webSplashDismissRequested remains ZERO baseline until P7 lifecycle integration.",
  };
}
