import type { IntroV3Layer } from "@/lib/startup/intro-v3/document";
import type {
  IntroV3LibraryIntent,
  IntroV3LibrarySelection,
  IntroV3MediaRef,
} from "@/lib/startup/intro-v3/media-types";

export type IntroV3LibraryOutcome =
  | { kind: "cancel" }
  | { kind: "fail"; errorCode: string }
  | { kind: "select"; selection: IntroV3LibrarySelection };

export type IntroV3LibraryApplyResult = {
  selected: IntroV3LibrarySelection | null;
  sceneMutated: boolean;
  layersCreated: number;
  detachedOldAsset: boolean;
  previousMediaRef: IntroV3MediaRef | null;
  nextMediaRef: IntroV3MediaRef | null;
};

const EMPTY: IntroV3LibraryApplyResult = {
  selected: null,
  sceneMutated: false,
  layersCreated: 0,
  detachedOldAsset: false,
  previousMediaRef: null,
  nextMediaRef: null,
};

/**
 * V3-1: Library returns a selection only. Cancel/fail = Scene mutation 0.
 * Layer creation is V3-2. REPLACE does not detach the previous asset.
 */
export function applyIntroV3LibraryOutcome(
  outcome: IntroV3LibraryOutcome,
  opts?: { replaceLayer?: IntroV3Layer | null }
): IntroV3LibraryApplyResult {
  if (outcome.kind === "cancel" || outcome.kind === "fail") {
    return { ...EMPTY };
  }
  const intent = outcome.selection.intent;
  if (intent === "REPLACE_MEDIA") {
    const previous = mediaRefFromLayer(opts?.replaceLayer ?? null);
    return {
      selected: outcome.selection,
      sceneMutated: false,
      layersCreated: 0,
      detachedOldAsset: false,
      previousMediaRef: previous,
      nextMediaRef: outcome.selection.mediaRef,
    };
  }
  return {
    selected: outcome.selection,
    sceneMutated: false,
    layersCreated: 0,
    detachedOldAsset: false,
    previousMediaRef: null,
    nextMediaRef: outcome.selection.mediaRef,
  };
}

export function mediaRefFromLayer(layer: IntroV3Layer | null | undefined): IntroV3MediaRef | null {
  if (!layer) return null;
  if (layer.type === "IMAGE" || layer.type === "LOGO") {
    return parseMediaRefToken(layer.payload.mediaRef);
  }
  if (layer.type === "DECORATION" && layer.payload.kind === "MEDIA") {
    return parseMediaRefToken(layer.payload.mediaRef);
  }
  return null;
}

export function parseMediaRefToken(raw: string): IntroV3MediaRef | null {
  const [sourceId, derivativeId] = raw.split(":");
  if (!sourceId || !derivativeId) return null;
  return { sourceId, derivativeId };
}

export function formatMediaRefToken(ref: IntroV3MediaRef): string {
  return `${ref.sourceId}:${ref.derivativeId}`;
}

export function isAddIntent(intent: IntroV3LibraryIntent): boolean {
  return (
    intent === "ADD_IMAGE" ||
    intent === "ADD_LOGO" ||
    intent === "SET_BACKGROUND_IMAGE" ||
    intent === "ADD_MEDIA_DECORATION"
  );
}
