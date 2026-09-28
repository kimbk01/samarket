import { parseIntroV3Document, type IntroV3Document } from "@/lib/startup/intro-v3/document";
import { backgroundIsNotALayer } from "@/lib/startup/intro-v3/layer-model";
import { introV3GeometryHasCssPixels } from "@/lib/startup/intro-v3/geometry";
import { motionLooksLikeCss } from "@/lib/startup/intro-v3/motion";
import { introV3MediaIsReady } from "@/lib/startup/intro-v3/media-types";
import { isIntroV3PersistableRef } from "@/lib/startup/intro-v3/persistable";

export type IntroV3ValidationIssue = {
  code: string;
  path: string;
};

export function validateIntroV3Document(raw: unknown): {
  ok: boolean;
  document: IntroV3Document | null;
  issues: IntroV3ValidationIssue[];
} {
  const issues: IntroV3ValidationIssue[] = [];
  const document = parseIntroV3Document(raw);
  if (!document) {
    return { ok: false, document: null, issues: [{ code: "invalid_document", path: "v3" }] };
  }
  for (const [si, scene] of document.scenes.entries()) {
    if (!backgroundIsNotALayer(scene.layers)) {
      issues.push({ code: "background_in_layers", path: `scenes[${si}].layers` });
    }
    if (introV3GeometryHasCssPixels(scene)) {
      issues.push({ code: "css_pixels_persisted", path: `scenes[${si}]` });
    }
    if (motionLooksLikeCss(scene.transition)) {
      issues.push({ code: "css_motion", path: `scenes[${si}].transition` });
    }
    for (const [li, layer] of scene.layers.entries()) {
      if (introV3GeometryHasCssPixels(layer.geometry)) {
        issues.push({ code: "css_pixels_persisted", path: `scenes[${si}].layers[${li}].geometry` });
      }
      if (motionLooksLikeCss(layer.motion)) {
        issues.push({ code: "css_motion", path: `scenes[${si}].layers[${li}].motion` });
      }
    }
  }
  return { ok: issues.length === 0, document, issues };
}

export function validateIntroV3MediaReady(input: {
  sourceStatus: "pending" | "processing" | "ready" | "failed";
  derivativeStatus: "pending" | "processing" | "ready" | "failed";
  sourceRef: string | null | undefined;
  derivativeRef: string | null | undefined;
  derivativeExists: boolean;
}): boolean {
  return introV3MediaIsReady({
    sourceStatus: input.sourceStatus,
    derivativeStatus: input.derivativeStatus,
    sourcePersistable: isIntroV3PersistableRef(input.sourceRef),
    derivativePersistable: isIntroV3PersistableRef(input.derivativeRef),
    derivativeExists: input.derivativeExists,
  });
}
