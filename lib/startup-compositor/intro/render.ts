/**
 * REBUILD 14 P4 — Intro shared semantic renderer (phase of ONE compositor).
 * Phase of ONE compositor only — no independent Intro presentation host. No native playback.
 */

import {
  BASE_COMPOSITION_ASPECT,
  INTRO13_SCHEMA_VERSION,
  normalizeDocumentV1,
  validateDocumentIssues,
  type ElementTypeV1,
  type IntroDocumentV1,
  type SceneV1,
} from "@/lib/intro/contracts/document";
import {
  isMotionTypeV1,
  normalizeMotionV1,
} from "@/lib/intro/contracts/capability-registry";
import {
  isTransitionTypeV1,
  normalizeTransitionV1,
} from "@/lib/intro/contracts/capability-registry";
import type { StartupPackageEnvelope } from "@/lib/startup-compositor/envelope";
import type { IntroEnvelope } from "@/lib/startup-compositor/intro-envelope";
import { assertUniqueSceneIds } from "@/lib/startup-compositor/intro/document-ops";
import {
  documentToIntroRenderModel,
  type IntroAbsentModel,
  type IntroPhaseModel,
  type IntroRenderModel,
} from "@/lib/startup-compositor/intro/render-model";
import type { IntroVisibilityStep } from "@/lib/startup-compositor/intro/phase";
import {
  resolveActiveGenerationMedia,
  type MediaAvailabilityEntry,
} from "@/lib/startup-compositor/system-start/media";
import {
  SCENE_BACKGROUND_GIF_SUPPORTED,
  SCENE_BACKGROUND_VIDEO_SUPPORTED,
} from "@/lib/startup-compositor/intro/media-formats";

const ALLOWED_ELEMENT_TYPES = new Set<string>([
  "IMAGE",
  "LOGO",
  "TEXT",
  "CTA",
  "VIDEO",
]);

export type BuildIntroRenderResult =
  | { readonly ok: true; readonly value: IntroPhaseModel; readonly document: IntroDocumentV1 | null }
  | { readonly ok: false; readonly reason: string };

export type BuildIntroRenderInput = {
  readonly intro: IntroEnvelope;
  readonly envelope: StartupPackageEnvelope;
  readonly availability: ReadonlyMap<string, MediaAvailabilityEntry> | Record<string, MediaAvailabilityEntry>;
  readonly visibility?: IntroVisibilityStep;
  readonly activeSceneIndex?: number;
  /** Scene1 pixels ready for SS→Intro (performance policy, not second surface). */
  readonly scene1Paintable?: boolean;
};

/**
 * Parse opaque envelope.document into IntroDocumentV1 (fail-closed).
 */
export function parseIntroDocument(raw: unknown):
  | { readonly ok: true; readonly value: IntroDocumentV1 }
  | { readonly ok: false; readonly reason: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "intro_document_invalid" };
  }
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== INTRO13_SCHEMA_VERSION) {
    return { ok: false, reason: "intro_schema_version" };
  }
  if (typeof o.title !== "string" || !o.title.trim()) {
    return { ok: false, reason: "intro_title_invalid" };
  }
  if (!Array.isArray(o.scenes) || o.scenes.length === 0) {
    return { ok: false, reason: "intro_empty_scenes" };
  }
  const aspect = o.compositionAspect as { w?: number; h?: number } | undefined;
  if (
    !aspect ||
    aspect.w !== BASE_COMPOSITION_ASPECT.w ||
    aspect.h !== BASE_COMPOSITION_ASPECT.h
  ) {
    return { ok: false, reason: "intro_composition_aspect" };
  }

  for (const scene of o.scenes as SceneV1[]) {
    if (!scene || typeof scene !== "object") {
      return { ok: false, reason: "intro_scene_invalid" };
    }
    if (!scene.id || typeof scene.id !== "string") {
      return { ok: false, reason: "intro_scene_id_invalid" };
    }
    for (const el of scene.elements || []) {
      if (!ALLOWED_ELEMENT_TYPES.has(el.type)) {
        return { ok: false, reason: `unknown_element:${String(el.type)}` };
      }
      // Motion vs transition slot separation — fail-closed, no silent NONE.
      if (el.motion && typeof el.motion === "object") {
        const mt = (el.motion as { type?: unknown }).type;
        if (typeof mt === "string" && isTransitionTypeV1(mt) && !isMotionTypeV1(mt)) {
          return { ok: false, reason: `motion_slot_rejected_transition:${mt}` };
        }
        if (normalizeMotionV1(el.motion) == null && typeof mt === "string") {
          return { ok: false, reason: `unsupported_motion:${mt}` };
        }
      }
    }
    const tr = scene.transition;
    if (tr && typeof tr === "object") {
      const tt = (tr as { type?: unknown }).type;
      if (typeof tt === "string" && isMotionTypeV1(tt) && !isTransitionTypeV1(tt)) {
        return { ok: false, reason: `transition_slot_rejected_motion:${tt}` };
      }
      if (normalizeTransitionV1(tr) == null) {
        return { ok: false, reason: `unsupported_transition:${String(tt)}` };
      }
    }
  }

  const doc = normalizeDocumentV1(raw as IntroDocumentV1);
  if (!assertUniqueSceneIds(doc)) {
    return { ok: false, reason: "duplicate_scene_ids" };
  }
  const issues = validateDocumentIssues(doc);
  if (issues.length) {
    return { ok: false, reason: issues[0]!.code };
  }
  return { ok: true, value: doc };
}

function collectRequiredMediaIds(doc: IntroDocumentV1): string[] {
  const ids = new Set<string>();
  for (const scene of doc.scenes) {
    if (scene.background.type === "IMAGE") {
      ids.add(scene.background.mediaId);
    }
    for (const el of scene.elements) {
      if (el.type === "IMAGE" || el.type === "LOGO" || el.type === "VIDEO") {
        const mid = (el.payload as { mediaId?: string }).mediaId;
        if (mid) ids.add(mid);
      }
    }
  }
  return [...ids];
}

/**
 * Build Intro phase model. present=false → absent path (valid).
 */
export function buildIntroRenderModel(
  input: BuildIntroRenderInput,
): BuildIntroRenderResult {
  if (input.intro.present === false) {
    const absent: IntroAbsentModel = {
      kind: "INTRO_ABSENT",
      present: false,
      path: "SYSTEM_START_TO_HOME",
    };
    return { ok: true, value: absent, document: null };
  }

  const parsed = parseIntroDocument(input.intro.document);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason };
  }
  const doc = parsed.value;

  // Scene background GIF/VIDEO not in document contract — reject invented kinds.
  for (const scene of doc.scenes) {
    const bgType = (scene.background as { type: string }).type;
    if (bgType === "GIF" && !SCENE_BACKGROUND_GIF_SUPPORTED) {
      return { ok: false, reason: "scene_background_gif_unsupported" };
    }
    if ((bgType === "VIDEO" || bgType === "MP4") && !SCENE_BACKGROUND_VIDEO_SUPPORTED) {
      return { ok: false, reason: "scene_background_video_unsupported" };
    }
  }

  for (const mediaId of collectRequiredMediaIds(doc)) {
    const resolved = resolveActiveGenerationMedia({
      envelope: input.envelope,
      mediaId,
      availability: input.availability,
    });
    if (!resolved.ok) {
      return { ok: false, reason: resolved.reason };
    }
    if (resolved.value.generationId !== input.envelope.generationId) {
      return { ok: false, reason: "foreign_generation_media" };
    }
  }

  const model: IntroRenderModel = documentToIntroRenderModel(doc, {
    activeSceneIndex: input.activeSceneIndex ?? 0,
    visibility: input.visibility ?? "INTRO_IR_READY",
    scene1Paintable: input.scene1Paintable ?? false,
  });

  return { ok: true, value: model, document: doc };
}

export function isElementTypeSupported(type: string): type is ElementTypeV1 {
  return ALLOWED_ELEMENT_TYPES.has(type);
}

/**
 * Minimum Intro readiness for SS→Intro:
 * Scene1 meaningful pixels ready; later scenes may preload asynchronously.
 */
export type IntroReadinessPolicy = {
  readonly scene1RequiredBeforeSsTransition: true;
  readonly decodeAllScenesBeforeStart: false;
};

export const INTRO_READINESS_POLICY: IntroReadinessPolicy = {
  scene1RequiredBeforeSsTransition: true,
  decodeAllScenesBeforeStart: false,
};
