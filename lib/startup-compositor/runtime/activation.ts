/**
 * REBUILD 14 — production presentation activation boundary.
 *
 * P2 skeleton + P3 System Start shared render contract are structurally present
 * but MUST NOT become Owner-visible until P7 lifecycle bind with valid content.
 *
 * Do not invent a feature-flag maze: one frozen constant.
 */
export const STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE = false as const;

export type StartupCompositorActivation = {
  readonly productionPresentationActive: boolean;
  readonly phase: "P3_SYSTEM_START_RENDER_CONTRACT";
  readonly note: string;
};

export function getStartupCompositorActivation(): StartupCompositorActivation {
  return {
    productionPresentationActive: STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE,
    phase: "P3_SYSTEM_START_RENDER_CONTRACT",
    note:
      "System Start shared render contract present; Production presentation = NO. " +
      "MainActivity / iOS root remain unwired until P7. " +
      "webSplashDismissRequested remains ZERO baseline until P7 lifecycle integration.",
  };
}
