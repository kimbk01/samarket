/**
 * REBUILD 14 P4 — Element Replace semantics.
 * Preserve elementId, geometry, motion, timing, other authored properties.
 * Change mediaRef only.
 */

import type {
  ElementV1,
  ImagePayloadV1,
  IntroDocumentV1,
  VideoPayloadV1,
} from "@/lib/intro/contracts/document";

export type ReplaceMediaResult =
  | { readonly ok: true; readonly value: IntroDocumentV1; readonly element: ElementV1 }
  | { readonly ok: false; readonly reason: string };

export function replaceElementMedia(
  doc: IntroDocumentV1,
  elementId: string,
  mediaId: string,
): ReplaceMediaResult {
  const mid = String(mediaId || "").trim();
  if (!mid) return { ok: false, reason: "media_id_empty" };

  for (let si = 0; si < doc.scenes.length; si++) {
    const scene = doc.scenes[si]!;
    const ei = scene.elements.findIndex((e) => e.id === elementId);
    if (ei < 0) continue;
    const el = scene.elements[ei]!;
    if (el.type !== "IMAGE" && el.type !== "LOGO" && el.type !== "VIDEO") {
      return { ok: false, reason: "element_not_media" };
    }
    const prev = el.payload as ImagePayloadV1 | VideoPayloadV1;
    const nextPayload =
      el.type === "VIDEO"
        ? ({ ...(prev as VideoPayloadV1), mediaId: mid } satisfies VideoPayloadV1)
        : ({ ...(prev as ImagePayloadV1), mediaId: mid } satisfies ImagePayloadV1);

    const nextEl: ElementV1 = {
      ...el,
      // Preserve identity + geometry + motion + timing.
      id: el.id,
      frame: { ...el.frame },
      motion: { ...el.motion },
      payload: nextPayload,
    };
    const elements = [...scene.elements];
    elements[ei] = nextEl;
    const scenes = [...doc.scenes];
    scenes[si] = { ...scene, elements };
    return {
      ok: true,
      value: { ...doc, scenes },
      element: nextEl,
    };
  }
  return { ok: false, reason: "element_not_found" };
}
