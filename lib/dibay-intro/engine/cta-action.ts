import type { CtaLayer, DibayIntroDocument } from "@/lib/dibay-intro/document";
import { isApprovedIntroCtaRoute } from "@/lib/dibay-intro/cta-routes";

export type CtaRuntimeResult =
  | { kind: "CONTINUE"; seekMs: number }
  | { kind: "FINISH" }
  | { kind: "INTERNAL_ROUTE"; destination: string; navigateAdmin: false }
  | { kind: "IGNORE" };

export function sceneStartMs(document: DibayIntroDocument, sceneIndex: number): number {
  let cursor = 0;
  for (let i = 0; i < sceneIndex; i += 1) {
    cursor += document.scenes[i]?.durationMs ?? 0;
  }
  return cursor;
}

export function resolveCtaRuntimeAction(
  layer: CtaLayer,
  document: DibayIntroDocument,
  elapsedMs: number,
): CtaRuntimeResult {
  if (layer.action === "FINISH_INTRO") return { kind: "FINISH" };
  if (layer.action === "CONTINUE") {
    let cursor = 0;
    for (let i = 0; i < document.scenes.length; i += 1) {
      const end = cursor + document.scenes[i].durationMs;
      if (elapsedMs < end || i === document.scenes.length - 1) {
        if (i >= document.scenes.length - 1) return { kind: "FINISH" };
        return { kind: "CONTINUE", seekMs: end };
      }
      cursor = end;
    }
    return { kind: "FINISH" };
  }
  if (layer.action === "APPROVED_INTERNAL_ROUTE") {
    if (!isApprovedIntroCtaRoute(layer.destination)) return { kind: "IGNORE" };
    return { kind: "INTERNAL_ROUTE", destination: layer.destination as string, navigateAdmin: false };
  }
  return { kind: "IGNORE" };
}
