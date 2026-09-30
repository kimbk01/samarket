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
  readonly phase: "P4_INTRO_SHARED_RENDER_TIMELINE";
  readonly note: string;
};

export function getStartupCompositorActivation(): StartupCompositorActivation {
  return {
    productionPresentationActive: STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE,
    phase: "P4_INTRO_SHARED_RENDER_TIMELINE",
    note:
      "Intro shared semantic/render/timeline contract present; Production presentation = NO. " +
      "MainActivity / iOS root remain unwired until P7. " +
      "GIF/MP4 native playback = NOT_PROVEN. " +
      "webSplashDismissRequested remains ZERO baseline until P7 lifecycle integration.",
  };
}
