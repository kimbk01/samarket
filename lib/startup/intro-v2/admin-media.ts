/**
 * Phase 2 media surface — metadata + existing persistable image upload only.
 * GIF/MP4 validation pipeline is Phase 3; publish must fail-closed.
 */

import { validateIntroAssetRef, type IntroAssetContract } from "@/lib/startup/intro-v2/assets";
import {
  INTRO_ASSET_KINDS,
  isIn,
  type ContractResult,
  type IntroAssetKind,
} from "@/lib/startup/intro-v2/types";

export const INTRO_ADMIN_PLANNED_MEDIA = ["PNG", "JPG", "WebP", "GIF", "MP4"] as const;
export const INTRO_ADMIN_UPLOADABLE_MEDIA = ["PNG", "JPG", "WebP"] as const;

const READY_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

export function isIntroMediaUploadableNow(kind: IntroAssetKind, mime: string | null): boolean {
  if (kind !== "image") return false;
  if (!mime) return true;
  return READY_IMAGE_MIMES.has(mime.toLowerCase());
}

export function introMediaPublishBlockReason(asset: {
  kind: unknown;
  decodeStatus: unknown;
  mime?: string | null;
}): string | null {
  if (!isIn(INTRO_ASSET_KINDS, asset.kind)) return "asset_kind_invalid";
  if (asset.kind === "gif" || asset.kind === "video") {
    if (asset.decodeStatus !== "ready") return "media_pipeline_not_ready";
  }
  if (asset.decodeStatus === "failed") return "asset_decode_failed";
  if (asset.decodeStatus === "pending" && asset.kind !== "image") return "media_pipeline_not_ready";
  return null;
}

export function validateIntroAdminAssetForPublish(raw: unknown): ContractResult<IntroAssetContract> {
  const base = validateIntroAssetRef(raw);
  if (!base.ok) return base;
  const block = introMediaPublishBlockReason(base.value);
  if (block) return { ok: false, error: block };
  return base;
}

export function introMediaKindFromMime(mime: string | null): IntroAssetKind {
  const m = String(mime ?? "").toLowerCase();
  if (m === "image/gif") return "gif";
  if (m.startsWith("video/")) return "video";
  return "image";
}
