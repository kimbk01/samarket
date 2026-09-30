/**
 * REBUILD 14 P6 — PREVIEW consumes EDITOR_WORKING_DOCUMENT through
 * createPreviewSemanticApi() — same P5 execution semantics.
 *
 * Preview does NOT mutate Live. Preview does NOT silently use stale saved Draft
 * when working document has newer unsaved changes.
 */

import {
  createPreviewSemanticApi,
  type PreviewSemanticApi,
} from "@/lib/startup-compositor/execution/adapters";
import type { StartupAuthoringDocument } from "@/lib/startup-compositor/admin/authoring-document";
import { validateAuthoringDocument } from "@/lib/startup-compositor/admin/validate";
import type { IntroDocumentV1 } from "@/lib/intro/contracts/document";
import type { SystemStartIR } from "@/lib/startup-compositor/system-start-ir";

export const PREVIEW_SOURCE = "EDITOR_WORKING_DOCUMENT" as const;

export type PreviewBuildResult =
  | {
      readonly ok: true;
      readonly source: typeof PREVIEW_SOURCE;
      readonly semanticApi: PreviewSemanticApi;
      readonly systemStart: SystemStartIR;
      readonly intro: IntroDocumentV1 | null;
      readonly introEnabled: boolean;
      readonly mutatesLive: false;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly messageKo: string;
      readonly mutatesLive: false;
    };

/**
 * Preferred Owner workflow: EDIT → PREVIEW current editor state (Save not required).
 * Still runs canonical validation fail-closed.
 */
export function buildPreviewFromWorkingDocument(
  working: StartupAuthoringDocument,
): PreviewBuildResult {
  const v = validateAuthoringDocument(working);
  if (!v.ok) {
    return {
      ok: false,
      reason: v.reason,
      messageKo: v.messageKo,
      mutatesLive: false,
    };
  }
  return {
    ok: true,
    source: PREVIEW_SOURCE,
    semanticApi: createPreviewSemanticApi(),
    systemStart: working.systemStart,
    intro: working.introEnabled ? working.intro : null,
    introEnabled: working.introEnabled,
    mutatesLive: false,
  };
}

/** Guard: never Preview from saved Draft when working diverges. */
export function assertPreviewUsesWorkingDocument(args: {
  readonly workingFingerprint: string;
  readonly previewFingerprint: string;
}): boolean {
  return args.workingFingerprint === args.previewFingerprint;
}
