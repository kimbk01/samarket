import {
  parseOpeningDocument,
  type OpeningDocument,
} from "@/lib/opening-show/document";

export type OpeningPublishFailReason =
  | "no_scene"
  | "unsupported_version"
  | "invalid_geometry"
  | "media_not_ready"
  | "derivative_not_ready";

export type OpeningPublishValidation =
  | { ok: true; document: OpeningDocument; mediaIds: string[] }
  | { ok: false; reason: OpeningPublishFailReason };

export function validateOpeningDocumentForPublish(raw: unknown): OpeningPublishValidation {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const rec = raw as { version?: unknown; scenes?: unknown };
    if (rec.version !== 1) {
      return { ok: false, reason: "unsupported_version" };
    }
    if (!Array.isArray(rec.scenes) || rec.scenes.length < 1) {
      return { ok: false, reason: "no_scene" };
    }
  }
  const document = parseOpeningDocument(raw);
  if (!document) {
    return { ok: false, reason: "invalid_geometry" };
  }
  if (document.scenes.length < 1) return { ok: false, reason: "no_scene" };
  const playable = document.scenes[0]!.layers.filter((layer) => layer.visible);
  if (playable.length < 1) return { ok: false, reason: "no_scene" };
  const mediaIds = playable.map((layer) => layer.mediaId);
  return { ok: true, document, mediaIds };
}

export function openingPublishFailCopy(reason: OpeningPublishFailReason): {
  fallbackKo: string;
  fallbackEn: string;
} {
  switch (reason) {
    case "no_scene":
      return { fallbackKo: "장면이 없어 게시할 수 없습니다.", fallbackEn: "Cannot publish without a scene." };
    case "unsupported_version":
      return {
        fallbackKo: "이 문서 버전은 게시할 수 없습니다.",
        fallbackEn: "This document version cannot be published.",
      };
    case "invalid_geometry":
      return {
        fallbackKo: "레이어 위치가 올바르지 않아 게시할 수 없습니다.",
        fallbackEn: "Layer geometry is invalid, so this cannot be published.",
      };
    case "media_not_ready":
      return {
        fallbackKo: "이미지가 아직 준비되지 않아 게시할 수 없습니다.",
        fallbackEn: "An image is not ready, so this cannot be published.",
      };
    case "derivative_not_ready":
      return {
        fallbackKo: "앱용 이미지가 아직 준비되지 않아 게시할 수 없습니다.",
        fallbackEn: "App images are not ready, so this cannot be published.",
      };
  }
}
