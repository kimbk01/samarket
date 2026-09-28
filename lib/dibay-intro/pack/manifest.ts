import type { DibayIntroDocument } from "@/lib/dibay-intro/document";

export type DibayIntroPackManifest = {
  version: 1;
  introId: string;
  revisionId: string;
  engineId: string;
  engineVersion: number;
  engineHash: string;
  documentChecksum: string;
  font: { family: string; file: string };
  media: Array<{ id: string; file: string; mime: string; animated: boolean; checksum: string }>;
  completeness: "READY";
};

export function parseIntroPackManifest(raw: unknown):
  | { ok: true; manifest: DibayIntroPackManifest }
  | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "manifest_not_object" };
  const m = raw as Record<string, unknown>;
  if (m.version !== 1) return { ok: false, reason: "manifest_version" };
  if (typeof m.introId !== "string" || typeof m.revisionId !== "string") return { ok: false, reason: "manifest_ids" };
  if (m.completeness !== "READY") return { ok: false, reason: "manifest_not_ready" };
  if (!Array.isArray(m.media)) return { ok: false, reason: "manifest_media" };
  if (typeof m.engineHash !== "string" || !m.engineHash) return { ok: false, reason: "manifest_engine_hash" };
  if (typeof m.documentChecksum !== "string" || !m.documentChecksum) return { ok: false, reason: "manifest_document_checksum" };
  return { ok: true, manifest: m as unknown as DibayIntroPackManifest };
}

export function emptyMediaMap(document: DibayIntroDocument): string[] {
  return document.scenes.flatMap((scene) =>
    scene.layers.flatMap((layer) => (layer.type === "IMAGE" || layer.type === "LOGO" ? [layer.mediaId] : [])),
  );
}
