import type {
  GenerationManifestR15,
  StartupPresentationAssetManifestItemR15,
  StartupPresentationDocumentR15,
} from "@/lib/startup-presentation/document";
import {
  STARTUP_PRESENTATION_DEFAULT_LOGO_LABEL,
  createBootstrapStartupPresentationDocument,
} from "@/lib/startup-presentation/document";

export type StartupPresentationEngineStateR15 =
  | "BOOTSTRAP"
  | "SYSTEM_START_PREPARING"
  | "SYSTEM_START_VISIBLE"
  | "SYSTEM_START_MINIMUM_SATISFIED"
  | "HOME_WAIT"
  | "HOME_PRESENTATION_READY"
  | "HANDOFF";

export type StartupPresentationClockR15 = {
  now: () => number;
};

export type StartupPresentationEngineInputR15 = {
  manifest: GenerationManifestR15 | null;
  homePresentationReady: boolean;
  visibleCommittedAt: number | null;
  stateEnteredAt: number;
  state: StartupPresentationEngineStateR15;
  clock: StartupPresentationClockR15;
};

export type StartupPresentationLogoPaintR15 = {
  label: string;
  asset: StartupPresentationAssetManifestItemR15 | null;
  x: number;
  y: number;
  width: number;
  height: number;
  fit: "contain";
};

export type StartupPresentationPaintR15 = {
  generationId: string;
  document: StartupPresentationDocumentR15;
  backgroundColor: string;
  logo: StartupPresentationLogoPaintR15;
};

export type StartupPresentationEngineOutputR15 = {
  state: StartupPresentationEngineStateR15;
  paint: StartupPresentationPaintR15;
  minimumSatisfied: boolean;
  shouldNotifyVisualCommit: boolean;
  shouldHandoff: boolean;
};

export const BOOTSTRAP_GENERATION_ID_R15 = "bootstrap-r15-v1";

export function createBootstrapGenerationManifestR15(): GenerationManifestR15 {
  const document = createBootstrapStartupPresentationDocument();
  return {
    schemaVersion: 1,
    generationId: BOOTSTRAP_GENERATION_ID_R15,
    documentHash: "bootstrap",
    document,
    assetManifest: [],
    createdAt: "1970-01-01T00:00:00.000Z",
    publishedAt: "1970-01-01T00:00:00.000Z",
    integrity: { algorithm: "sha256", manifestHash: "bootstrap" },
  };
}

export function projectStartupPresentationPaintR15(
  manifest: GenerationManifestR15 | null
): StartupPresentationPaintR15 {
  const source = manifest ?? createBootstrapGenerationManifestR15();
  const logo = source.document.systemStart.logo;
  const asset = logo.assetId
    ? source.assetManifest.find((item) => item.assetId === logo.assetId) ?? null
    : null;
  return {
    generationId: source.generationId,
    document: source.document,
    backgroundColor: source.document.systemStart.backgroundColor,
    logo: {
      label: STARTUP_PRESENTATION_DEFAULT_LOGO_LABEL,
      asset,
      x: logo.x,
      y: logo.y,
      width: logo.width,
      height: logo.height,
      fit: "contain",
    },
  };
}

export function evaluateStartupPresentationEngineR15(
  input: StartupPresentationEngineInputR15
): StartupPresentationEngineOutputR15 {
  const paint = projectStartupPresentationPaintR15(input.manifest);
  const minimumVisibleMs = paint.document.systemStart.minimumVisibleMs;
  const now = input.clock.now();
  const visibleAt = input.visibleCommittedAt;
  const minimumSatisfied =
    visibleAt != null && Math.max(0, now - visibleAt) >= minimumVisibleMs;
  let state = input.state;

  if (state === "BOOTSTRAP") state = "SYSTEM_START_PREPARING";
  if (state === "SYSTEM_START_PREPARING" && visibleAt != null) {
    state = "SYSTEM_START_VISIBLE";
  }
  if (state === "SYSTEM_START_VISIBLE" && minimumSatisfied) {
    state = "SYSTEM_START_MINIMUM_SATISFIED";
  }
  if (state === "SYSTEM_START_MINIMUM_SATISFIED") {
    state = input.homePresentationReady ? "HOME_PRESENTATION_READY" : "HOME_WAIT";
  }
  if (state === "HOME_WAIT" && input.homePresentationReady && minimumSatisfied) {
    state = "HOME_PRESENTATION_READY";
  }
  if (state === "HOME_PRESENTATION_READY") {
    state = "HANDOFF";
  }

  return {
    state,
    paint,
    minimumSatisfied,
    shouldNotifyVisualCommit:
      input.state === "SYSTEM_START_PREPARING" && visibleAt == null,
    shouldHandoff: state === "HANDOFF",
  };
}
