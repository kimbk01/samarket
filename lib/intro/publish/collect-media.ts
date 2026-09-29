/**
 * Collect authored mediaRefIds from IntroDocumentV1 (IMAGE / LOGO only).
 */

import type { IntroDocumentV1 } from "@/lib/intro/contracts/document";

export function collectAuthoredMediaRefIds(
  document: IntroDocumentV1,
): string[] {
  const ids = new Set<string>();
  for (const scene of document.scenes) {
    for (const layer of scene.layers) {
      if (layer.type === "IMAGE" || layer.type === "LOGO") {
        if (typeof layer.mediaRefId === "string" && layer.mediaRefId.length > 0) {
          ids.add(layer.mediaRefId);
        }
      }
    }
  }
  return [...ids].sort();
}
