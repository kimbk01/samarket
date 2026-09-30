/**
 * REBUILD 14 P2 — production presentation activation boundary.
 *
 * P2 skeleton is structurally present but MUST NOT become Owner-visible
 * until later phases provide valid product content + lifecycle bind (P7+).
 *
 * Do not invent a feature-flag maze: one frozen constant.
 */
export const STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE = false as const;

export type StartupCompositorActivation = {
  readonly productionPresentationActive: boolean;
  readonly phase: "P2_SKELETON";
  readonly note: string;
};

export function getStartupCompositorActivation(): StartupCompositorActivation {
  return {
    productionPresentationActive: STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE,
    phase: "P2_SKELETON",
    note:
      "Structurally present; not Owner-visible in Production. " +
      "webSplashDismissRequested remains ZERO baseline until P7 lifecycle integration.",
  };
}
