/**
 * REBUILD 14 — production presentation activation boundary.
 *
 * P7 lifecycle bind: MainActivity / iOS root wire ONE DibayStartupCompositorHost.
 * Presentation still fail-closes when no verified OWNER StartupPackageEnvelope.
 *
 * Do not invent a feature-flag maze: one frozen constant.
 */
export const STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE = true as const;

export type StartupCompositorActivation = {
  readonly productionPresentationActive: boolean;
  readonly phase: "P7_NATIVE_LIFECYCLE_INTEGRATION";
  readonly note: string;
};

export function getStartupCompositorActivation(): StartupCompositorActivation {
  return {
    productionPresentationActive: STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE,
    phase: "P7_NATIVE_LIFECYCLE_INTEGRATION",
    note:
      "P7 native lifecycle wired: PLATFORM BOOT → ONE compositor → SYSTEM START → " +
      "optional INTRO → HOME. Fail-closed without OWNER StartupPackageEnvelope. " +
      "GIF/MP4 native playback = NOT_PROVEN. MP4 audio = OPEN PRODUCT DECISION. " +
      "OS splash releases on compositor first product frame (or skip → web dismiss).",
  };
}
