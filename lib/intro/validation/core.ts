/**
 * DIBAY INTRO — Phase 1
 * One pure validator core shared by DRAFT / PUBLISH / PACK / DEVICE modes.
 * No DB / network / Storage / React.
 */

import type {
  CtaActionV1,
  FrameV1,
  IntroDocumentV1,
  LayerV1,
  SceneV1,
  TransitionV1,
} from "../contracts/document";
import {
  BASE_COMPOSITION_ASPECT,
  CTA_ACTION_TYPES,
  INTRO_SCHEMA_VERSION,
  MIN_FRAME,
  PRETENDARD_WEIGHT_TO_ASSET,
  TABLET_LANDSCAPE_ASPECT,
} from "../contracts/document";
import type { PackManifestStructuralV1 } from "../contracts/pack";
import type {
  DeviceCompatibilityDecision,
  DeviceCompatibilityInput,
} from "../contracts/pack";
import { GifRuntimeFormat } from "../contracts/gif";
import {
  isFullyVisibleInViewport,
  resolveLayerGeometry,
  resolveViewportImageRect,
  type ViewportSize,
} from "../geometry/responsive-mapping";
import { issue, result, type ValidationIssue, type ValidationResult } from "./issues";

export type PublishMediaLookup = {
  /** External input interface — Phase 1 does not query DB. */
  readonly isMediaReady?: (mediaRefId: string) => boolean;
  readonly approvedInternalRoutes?: ReadonlySet<string>;
};

const PHONE_VIEWPORT: ViewportSize = { width: 360, height: 800 };
const TABLET_VIEWPORT: ViewportSize = { width: 1280, height: 800 };

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function validateFrame(
  frame: FrameV1,
  path: string,
  mode: "DRAFT" | "PUBLISH",
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (
    typeof frame.x !== "number" ||
    typeof frame.y !== "number" ||
    typeof frame.w !== "number" ||
    typeof frame.h !== "number" ||
    !Number.isFinite(frame.x) ||
    !Number.isFinite(frame.y) ||
    !Number.isFinite(frame.w) ||
    !Number.isFinite(frame.h)
  ) {
    issues.push(issue("INVALID_GEOMETRY", "error", path, "Frame must be finite numbers"));
    return issues;
  }
  if (frame.w <= 0 || frame.h <= 0) {
    issues.push(
      issue("INVALID_GEOMETRY", "error", path, "Frame w/h must be > 0"),
    );
  } else if (frame.w < MIN_FRAME || frame.h < MIN_FRAME) {
    issues.push(
      issue(
        "INVALID_GEOMETRY",
        mode === "PUBLISH" ? "error" : "warning",
        path,
        `Frame w/h must be >= ${MIN_FRAME}`,
      ),
    );
  }
  const outside =
    frame.x < 0 ||
    frame.y < 0 ||
    frame.x + frame.w > 1 ||
    frame.y + frame.h > 1;
  if (outside) {
    issues.push(
      issue(
        "GEOMETRY_OUTSIDE_COMPOSITION",
        mode === "PUBLISH" ? "warning" : "warning",
        path,
        "Frame partially outside [0,1]^2",
      ),
    );
  }
  return issues;
}

function validateTransition(
  transition: TransitionV1 | null,
  path: string,
  isLast: boolean,
  mode: "DRAFT" | "PUBLISH",
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (isLast) {
    if (transition != null) {
      issues.push(
        issue(
          "INVALID_TRANSITION",
          mode === "PUBLISH" ? "error" : "warning",
          path,
          "Last scene.transitionAfter must be null",
        ),
      );
    }
    return issues;
  }
  if (transition == null) {
    issues.push(
      issue(
        "INVALID_TRANSITION",
        mode === "PUBLISH" ? "error" : "warning",
        path,
        "Non-last scene requires transitionAfter",
      ),
    );
    return issues;
  }
  if (transition.type === "CUT") {
    if (transition.durationMs !== 0) {
      issues.push(
        issue("INVALID_TRANSITION", "error", path, "CUT durationMs must be 0"),
      );
    }
  } else if (transition.type === "FADE" || transition.type === "SLIDE") {
    if (!(transition.durationMs > 0) || !Number.isInteger(transition.durationMs)) {
      issues.push(
        issue(
          "INVALID_TRANSITION",
          "error",
          path,
          `${transition.type} durationMs must be integer > 0`,
        ),
      );
    }
    if (transition.type === "SLIDE") {
      const dir = transition.direction;
      if (!["LEFT", "RIGHT", "UP", "DOWN"].includes(dir)) {
        issues.push(
          issue("INVALID_TRANSITION", "error", path, "Invalid SLIDE direction"),
        );
      }
    }
  } else {
    issues.push(
      issue("INVALID_TRANSITION", "error", path, "Unsupported transition type"),
    );
  }
  return issues;
}

function validateCtaAction(
  action: CtaActionV1,
  path: string,
  mode: "DRAFT" | "PUBLISH",
  mediaLookup?: PublishMediaLookup,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!CTA_ACTION_TYPES.includes(action.type as (typeof CTA_ACTION_TYPES)[number])) {
    issues.push(
      issue("INVALID_CTA_ACTION", "error", path, "Unsupported CTA action"),
    );
    return issues;
  }
  if (action.type === "APPROVED_INTERNAL_ROUTE") {
    if (!action.routeId || typeof action.routeId !== "string") {
      issues.push(
        issue("INVALID_CTA_ACTION", "error", path, "routeId required"),
      );
    } else if (
      mode === "PUBLISH" &&
      mediaLookup?.approvedInternalRoutes &&
      !mediaLookup.approvedInternalRoutes.has(action.routeId)
    ) {
      issues.push(
        issue(
          "INVALID_CTA_ACTION",
          "error",
          path,
          "routeId not in approved internal route allowlist",
        ),
      );
    } else if (mode === "PUBLISH" && !mediaLookup?.approvedInternalRoutes) {
      issues.push(
        issue(
          "CTA_ROUTE_ALLOWLIST_REQUIRED",
          "error",
          path,
          "Publish requires approvedInternalRoutes validation input for APPROVED_INTERNAL_ROUTE",
        ),
      );
    }
  }
  return issues;
}

function validateLayer(
  layer: LayerV1,
  path: string,
  mode: "DRAFT" | "PUBLISH",
  mediaLookup?: PublishMediaLookup,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const types = ["IMAGE", "LOGO", "TEXT", "CTA"] as const;
  if (!types.includes(layer.type as (typeof types)[number])) {
    issues.push(issue("INVALID_LAYER_TYPE", "error", path, "Unsupported layer type"));
    return issues;
  }
  if (!layer.layerId || typeof layer.layerId !== "string") {
    issues.push(issue("INVALID_LAYER", "error", path, "layerId required"));
  }
  issues.push(...validateFrame(layer.frame, `${path}.frame`, mode));
  if (layer.layoutOverrides?.TABLET_LANDSCAPE) {
    issues.push(
      ...validateFrame(
        layer.layoutOverrides.TABLET_LANDSCAPE.frame,
        `${path}.layoutOverrides.TABLET_LANDSCAPE.frame`,
        mode,
      ),
    );
  }
  if (typeof layer.opacity !== "number" || layer.opacity < 0 || layer.opacity > 1) {
    issues.push(issue("INVALID_LAYER", "error", `${path}.opacity`, "opacity must be 0..1"));
  }
  if (!Number.isInteger(layer.zIndex)) {
    issues.push(issue("INVALID_LAYER", "error", `${path}.zIndex`, "zIndex must be integer"));
  }

  if (layer.type === "IMAGE" || layer.type === "LOGO") {
    if (!layer.mediaRefId || typeof layer.mediaRefId !== "string") {
      issues.push(
        issue("INVALID_MEDIA_REF", "error", `${path}.mediaRefId`, "mediaRefId required"),
      );
    } else if (
      mode === "PUBLISH" &&
      layer.visible &&
      mediaLookup?.isMediaReady &&
      !mediaLookup.isMediaReady(layer.mediaRefId)
    ) {
      issues.push(
        issue(
          "MEDIA_NOT_READY",
          "error",
          `${path}.mediaRefId`,
          "Visible image/logo requires READY media",
        ),
      );
    }
    if (layer.fit !== "CONTAIN" && layer.fit !== "COVER") {
      issues.push(issue("INVALID_LAYER", "error", `${path}.fit`, "fit must be CONTAIN|COVER"));
    }
    if (layer.type === "IMAGE") {
      if (layer.surface !== "CONTENT" && layer.surface !== "VIEWPORT") {
        issues.push(
          issue("INVALID_LAYER", "error", `${path}.surface`, "surface must be CONTENT|VIEWPORT"),
        );
      }
    }
  }

  if (layer.type === "TEXT") {
    if (typeof layer.content !== "string") {
      issues.push(issue("INVALID_TEXT", "error", `${path}.content`, "content required"));
    } else if (mode === "PUBLISH" && layer.visible && layer.content.trim().length === 0) {
      issues.push(
        issue("INVALID_TEXT", "error", `${path}.content`, "Visible TEXT requires non-empty content"),
      );
    }
    if (layer.font?.family !== "Pretendard") {
      issues.push(
        issue("INVALID_TEXT", "error", `${path}.font.family`, "Only Pretendard allowed"),
      );
    }
    const expected = layer.font?.weight
      ? PRETENDARD_WEIGHT_TO_ASSET[layer.font.weight]
      : undefined;
    if (!expected || layer.font.assetId !== expected) {
      issues.push(
        issue(
          "INVALID_TEXT",
          "error",
          `${path}.font`,
          "Pretendard weight/assetId mismatch or unsupported weight",
        ),
      );
    }
  }

  if (layer.type === "CTA") {
    if (mode === "PUBLISH" && (!layer.label || layer.label.trim().length === 0)) {
      issues.push(issue("INVALID_CTA", "error", `${path}.label`, "CTA label required for publish"));
    }
    issues.push(
      ...validateCtaAction(layer.action, `${path}.action`, mode, mediaLookup),
    );
  }

  return issues;
}

function validateScene(
  scene: SceneV1,
  sceneIndex: number,
  isLast: boolean,
  mode: "DRAFT" | "PUBLISH",
  mediaLookup?: PublishMediaLookup,
): ValidationIssue[] {
  const path = `scenes[${sceneIndex}]`;
  const issues: ValidationIssue[] = [];
  if (!scene.sceneId) {
    issues.push(issue("INVALID_SCENE", "error", `${path}.sceneId`, "sceneId required"));
  }
  if (!Number.isInteger(scene.durationMs) || scene.durationMs < 0) {
    issues.push(
      issue("INVALID_DURATION", "error", `${path}.durationMs`, "durationMs must be integer >= 0"),
    );
  } else if (mode === "PUBLISH" && scene.durationMs === 0) {
    issues.push(
      issue("INVALID_DURATION", "error", `${path}.durationMs`, "Publish requires durationMs > 0"),
    );
  }
  if (scene.background?.type !== "SOLID") {
    issues.push(
      issue("INVALID_SCENE", "error", `${path}.background`, "Only SOLID background in V1"),
    );
  }
  issues.push(
    ...validateTransition(
      scene.transitionAfter,
      `${path}.transitionAfter`,
      isLast,
      mode,
    ),
  );

  const zSeen = new Set<number>();
  const layerIds = new Set<string>();
  for (let i = 0; i < scene.layers.length; i++) {
    const layer = scene.layers[i]!;
    const layerPath = `${path}.layers[${i}]`;
    if (layerIds.has(layer.layerId)) {
      issues.push(
        issue("INVALID_LAYER", "error", layerPath, "Duplicate layerId in scene"),
      );
    }
    layerIds.add(layer.layerId);
    if (zSeen.has(layer.zIndex)) {
      issues.push(
        issue(
          "DUPLICATE_ZINDEX",
          mode === "PUBLISH" ? "error" : "warning",
          layerPath,
          "Duplicate zIndex within scene",
        ),
      );
    }
    zSeen.add(layer.zIndex);
    issues.push(...validateLayer(layer, layerPath, mode, mediaLookup));
  }
  return issues;
}

function validateDocumentShape(
  document: IntroDocumentV1,
  mode: "DRAFT" | "PUBLISH",
  mediaLookup?: PublishMediaLookup,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (document.schemaVersion !== INTRO_SCHEMA_VERSION) {
    issues.push(
      issue(
        "INVALID_SCHEMA_VERSION",
        "error",
        "schemaVersion",
        `Unsupported schemaVersion ${String(document.schemaVersion)}`,
      ),
    );
  }
  if (!document.documentId) {
    issues.push(issue("INVALID_DOCUMENT", "error", "documentId", "documentId required"));
  }
  const ca = document.settings?.compositionAspect;
  if (!ca || ca.w !== BASE_COMPOSITION_ASPECT.w || ca.h !== BASE_COMPOSITION_ASPECT.h) {
    issues.push(
      issue(
        "INVALID_COMPOSITION",
        "error",
        "settings.compositionAspect",
        "compositionAspect must be 9:16",
      ),
    );
  }
  const ta = document.settings?.tabletLandscapeAspect;
  if (
    !ta ||
    ta.w !== TABLET_LANDSCAPE_ASPECT.w ||
    ta.h !== TABLET_LANDSCAPE_ASPECT.h
  ) {
    issues.push(
      issue(
        "INVALID_COMPOSITION",
        mode === "PUBLISH" ? "error" : "warning",
        "settings.tabletLandscapeAspect",
        "tabletLandscapeAspect must be 16:10",
      ),
    );
  }
  if (!Array.isArray(document.scenes) || document.scenes.length === 0) {
    issues.push(
      issue(
        "INVALID_SCENES",
        mode === "PUBLISH" ? "error" : "warning",
        "scenes",
        "At least one scene required",
      ),
    );
    return issues;
  }
  const sceneIds = new Set<string>();
  for (let i = 0; i < document.scenes.length; i++) {
    const scene = document.scenes[i]!;
    if (sceneIds.has(scene.sceneId)) {
      issues.push(
        issue("INVALID_SCENE", "error", `scenes[${i}].sceneId`, "Duplicate sceneId"),
      );
    }
    sceneIds.add(scene.sceneId);
    issues.push(
      ...validateScene(
        scene,
        i,
        i === document.scenes.length - 1,
        mode,
        mediaLookup,
      ),
    );
  }
  return issues;
}

function validateResponsiveCtaVisibility(
  document: IntroDocumentV1,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let si = 0; si < document.scenes.length; si++) {
    const scene = document.scenes[si]!;
    for (let li = 0; li < scene.layers.length; li++) {
      const layer = scene.layers[li]!;
      if (layer.type !== "CTA" || !layer.visible) continue;
      const path = `scenes[${si}].layers[${li}]`;
      const phone = resolveLayerGeometry(layer, PHONE_VIEWPORT, "PHONE_PORTRAIT");
      const tablet = resolveLayerGeometry(
        layer,
        TABLET_VIEWPORT,
        "TABLET_LANDSCAPE",
      );
      if (!isFullyVisibleInViewport(phone.deviceRect, PHONE_VIEWPORT)) {
        issues.push(
          issue(
            "CTA_NOT_FULLY_VISIBLE_PHONE",
            "error",
            path,
            "Required CTA must be fully visible on PHONE path",
          ),
        );
      }
      if (!isFullyVisibleInViewport(tablet.deviceRect, TABLET_VIEWPORT)) {
        issues.push(
          issue(
            "CTA_NOT_FULLY_VISIBLE_TABLET",
            "error",
            path,
            "Required CTA must be fully visible on TABLET path (override or FIT fallback; never COVER)",
          ),
        );
      }
    }
  }
  return issues;
}

/** Parse unknown JSON into document shape check (version/type). */
export function parseIntroDocument(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isObject(input)) {
    return result("DRAFT", [
      issue("INVALID_DOCUMENT", "error", "", "Document must be an object"),
    ]);
  }
  if (input.schemaVersion !== INTRO_SCHEMA_VERSION) {
    issues.push(
      issue(
        "INVALID_SCHEMA_VERSION",
        "error",
        "schemaVersion",
        `Unsupported schemaVersion ${String(input.schemaVersion)}`,
      ),
    );
  }
  if (!Array.isArray(input.scenes)) {
    issues.push(issue("INVALID_SCENES", "error", "scenes", "scenes must be an array"));
  }
  if (issues.length > 0) return result("DRAFT", issues);
  return validateDraft(input as IntroDocumentV1);
}

export function validateDraft(document: IntroDocumentV1): ValidationResult {
  return result("DRAFT", validateDocumentShape(document, "DRAFT"));
}

export function validatePublish(
  document: IntroDocumentV1,
  mediaLookup: PublishMediaLookup = {},
): ValidationResult {
  const issues = [
    ...validateDocumentShape(document, "PUBLISH", mediaLookup),
    ...validateResponsiveCtaVisibility(document),
  ];
  return result("PUBLISH", issues);
}

export function validatePackManifest(
  manifest: PackManifestStructuralV1,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  for (const key of [
    "schemaVersion",
    "protocolVersion",
    "renderSpecVersion",
    "fontSpecVersion",
  ] as const) {
    if (!Number.isInteger(manifest[key]) || manifest[key] < 1) {
      issues.push(
        issue("INVALID_PACK", "error", key, `${key} must be integer >= 1`),
      );
    }
  }
  if (!manifest.packId) {
    issues.push(issue("INVALID_PACK", "error", "packId", "packId required"));
  }
  if (!manifest.publishedRevisionId) {
    issues.push(
      issue(
        "INVALID_PACK",
        "error",
        "publishedRevisionId",
        "publishedRevisionId required",
      ),
    );
  }
  if (!manifest.documentIntegrity?.documentId || !manifest.documentIntegrity?.documentDigest) {
    issues.push(
      issue(
        "INVALID_PACK",
        "error",
        "documentIntegrity",
        "document integrity references required",
      ),
    );
  }
  if (!Array.isArray(manifest.sealedAssets) || manifest.sealedAssets.length === 0) {
    issues.push(
      issue(
        "INVALID_PACK",
        "error",
        "sealedAssets",
        "At least one sealed asset reference required",
      ),
    );
  } else {
    for (let i = 0; i < manifest.sealedAssets.length; i++) {
      const a = manifest.sealedAssets[i]!;
      if (!a.sealedAssetId || !a.integrity || !a.mediaRefId) {
        issues.push(
          issue(
            "INVALID_PACK",
            "error",
            `sealedAssets[${i}]`,
            "sealedAssetId, mediaRefId, integrity required",
          ),
        );
      }
    }
  }
  return result("PACK", issues);
}

export function evaluateDeviceCompatibility(
  input: DeviceCompatibilityInput,
): DeviceCompatibilityDecision {
  const { candidate, device } = input;

  if (!device.supportedSchemaVersions.includes(candidate.schemaVersion)) {
    return {
      ok: false,
      activate: "REJECT",
      reason: "UNKNOWN_SCHEMA",
      detail: `schema ${String(candidate.schemaVersion)}`,
    };
  }
  if (!device.supportedProtocolVersions.includes(candidate.protocolVersion)) {
    return {
      ok: false,
      activate: "REJECT",
      reason: "UNKNOWN_PROTOCOL",
      detail: `protocol ${String(candidate.protocolVersion)}`,
    };
  }
  if (!device.supportedRenderSpecVersions.includes(candidate.renderSpecVersion)) {
    return {
      ok: false,
      activate: "REJECT",
      reason: "UNKNOWN_RENDER",
      detail: `render ${String(candidate.renderSpecVersion)}`,
    };
  }
  if (!device.supportedFontSpecVersions.includes(candidate.fontSpecVersion)) {
    return {
      ok: false,
      activate: "REJECT",
      reason: "UNKNOWN_FONT",
      detail: `font ${String(candidate.fontSpecVersion)}`,
    };
  }
  if (
    !device.supportedMediaRuntimeFormats.includes(candidate.mediaRuntimeFormat)
  ) {
    return {
      ok: false,
      activate: "REJECT",
      reason: "UNKNOWN_MEDIA_RUNTIME_FORMAT",
      detail: `mediaRuntimeFormat ${candidate.mediaRuntimeFormat}`,
    };
  }
  for (const t of candidate.transitions) {
    if (!device.supportedTransitions.includes(t)) {
      return {
        ok: false,
        activate: "REJECT",
        reason: "UNKNOWN_TRANSITION",
        detail: t,
      };
    }
  }
  for (const a of candidate.actions) {
    if (!device.supportedActions.includes(a)) {
      return {
        ok: false,
        activate: "REJECT",
        reason: "UNKNOWN_ACTION",
        detail: a,
      };
    }
  }
  return { ok: true, activate: "CANDIDATE_ALLOWED" };
}

export function validateDeviceCompatibility(
  input: DeviceCompatibilityInput,
): ValidationResult {
  const decision = evaluateDeviceCompatibility(input);
  if (decision.ok) {
    return result("DEVICE_COMPATIBILITY", []);
  }
  return result("DEVICE_COMPATIBILITY", [
    issue(decision.reason, "error", "candidate", decision.detail),
  ]);
}

/** Re-export helper used by tests for VIEWPORT vs CONTENT distinction. */
export { resolveViewportImageRect, GifRuntimeFormat };
