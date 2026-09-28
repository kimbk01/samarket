import { collectMediaIds, parseDibayIntroDocument, type DibayIntroDocument } from "@/lib/dibay-intro/document";
import { isApprovedIntroCtaRoute } from "@/lib/dibay-intro/cta-routes";

export type ReadyMediaIndex = ReadonlySet<string>;

export function validateDocumentForPublish(
  raw: unknown,
  readyMedia: ReadyMediaIndex,
): { ok: true; document: DibayIntroDocument } | { ok: false; issues: { path: string; message: string }[] } {
  const parsed = parseDibayIntroDocument(raw);
  if (!parsed.ok) return parsed;
  const issues: { path: string; message: string }[] = [];
  if (parsed.document.scenes.length < 1) {
    issues.push({ path: "scenes", message: "published Intro cannot have zero scenes" });
  }
  for (const mediaId of collectMediaIds(parsed.document)) {
    if (!readyMedia.has(mediaId)) {
      issues.push({ path: "media", message: `media ${mediaId} is not READY` });
    }
  }
  parsed.document.scenes.forEach((scene, si) => {
    scene.layers.forEach((layer, li) => {
      if (layer.type === "CTA" && layer.action === "APPROVED_INTERNAL_ROUTE") {
        if (!isApprovedIntroCtaRoute(layer.destination)) {
          issues.push({
            path: `scenes[${si}].layers[${li}].destination`,
            message: "CTA destination is not an approved product route",
          });
        }
      }
    });
  });
  if (issues.length) return { ok: false, issues };
  return { ok: true, document: parsed.document };
}
