/**
 * 앱 진입 어드민 v3 (Owner 2026-11-17 「v3대로 진행」) — 모든 그림 칸의 규격 단일 정의 + 검사(순수 모듈).
 *
 * 화면(1차 검사)과 서버(2차 검사)가 같은 값을 쓴다: 값은 각 서버 검사 모듈에서 가져온다.
 * - OS 로고: `lib/os-launch/contract.ts`
 * - 인트로 소재: `lib/launch-intro/pool.ts`
 * - 팝업: `lib/platform-popup/creative-size-spec.ts`
 */
import {
  OS_LAUNCH_LOGO_MAX_BYTES,
  OS_LAUNCH_LOGO_MAX_EDGE_PX,
  OS_LAUNCH_LOGO_MIN_EDGE_PX,
} from "@/lib/os-launch/contract";
import { LAUNCH_INTRO_IMAGE_MAX_BYTES, LAUNCH_INTRO_IMAGE_MAX_EDGE } from "@/lib/launch-intro/document";
import { LAUNCH_INTRO_POOL_MIN_LONG_EDGE } from "@/lib/launch-intro/pool";
import {
  POPUP_ARTWORK_MIN_LONG_EDGE,
  POPUP_ARTWORK_OUTPUT_MAX_EDGE,
  POPUP_CARD_MIN_SOURCE,
  POPUP_CARD_OUTPUT,
  POPUP_SOURCE_MAX_MB,
  POPUP_SOURCE_MAX_PIXELS,
} from "@/lib/platform-popup/creative-size-spec";

export type AdminImageMime = "image/png" | "image/jpeg" | "image/webp";

export type AdminImageSlotSpec = {
  id: "os_logo" | "intro_pool" | "popup_card" | "popup_artwork";
  mimes: readonly AdminImageMime[];
  maxBytes: number;
  /** 긴 변 최소(px) */
  minLongEdge?: number;
  /** 짧은 변 최소(px) */
  minShortEdge?: number;
  /** 비율 고정 칸 — 자른 뒤 최소 크기 */
  ratio?: { w: number; h: number; minWidth: number; minHeight: number };
  maxLongEdge?: number;
  maxPixels?: number;
  recommended: { width: number; height: number };
  /** 앱에 저장되는 모양 설명 키 */
  fit: "contain_bg" | "crop_ratio" | "contain_alpha" | "logo_center";
  transparency: "keep" | "required";
};

export const OS_LOGO_SLOT: AdminImageSlotSpec = {
  id: "os_logo",
  mimes: ["image/png"],
  maxBytes: OS_LAUNCH_LOGO_MAX_BYTES,
  minShortEdge: OS_LAUNCH_LOGO_MIN_EDGE_PX,
  maxLongEdge: OS_LAUNCH_LOGO_MAX_EDGE_PX,
  recommended: { width: 1024, height: 1024 },
  fit: "logo_center",
  transparency: "required",
};

export const INTRO_POOL_SLOT: AdminImageSlotSpec = {
  id: "intro_pool",
  mimes: ["image/png", "image/jpeg", "image/webp"],
  maxBytes: LAUNCH_INTRO_IMAGE_MAX_BYTES,
  minLongEdge: LAUNCH_INTRO_POOL_MIN_LONG_EDGE,
  maxLongEdge: LAUNCH_INTRO_IMAGE_MAX_EDGE,
  recommended: { width: 1080, height: 1920 },
  fit: "contain_bg",
  transparency: "keep",
};

export const POPUP_CARD_SLOT: AdminImageSlotSpec = {
  id: "popup_card",
  mimes: ["image/png", "image/jpeg", "image/webp"],
  maxBytes: POPUP_SOURCE_MAX_MB * 1024 * 1024,
  ratio: { w: 36, h: 25, minWidth: POPUP_CARD_MIN_SOURCE.width, minHeight: POPUP_CARD_MIN_SOURCE.height },
  maxPixels: POPUP_SOURCE_MAX_PIXELS,
  recommended: { width: POPUP_CARD_OUTPUT.width, height: POPUP_CARD_OUTPUT.height },
  fit: "crop_ratio",
  transparency: "keep",
};

export function popupArtworkSlot(recommended: { width: number; height: number }): AdminImageSlotSpec {
  return {
    id: "popup_artwork",
    mimes: ["image/png", "image/jpeg", "image/webp"],
    maxBytes: POPUP_SOURCE_MAX_MB * 1024 * 1024,
    minLongEdge: POPUP_ARTWORK_MIN_LONG_EDGE,
    maxPixels: POPUP_SOURCE_MAX_PIXELS,
    recommended,
    fit: "contain_alpha",
    transparency: "keep",
  };
}
export const POPUP_ARTWORK_OUTPUT_MAX = POPUP_ARTWORK_OUTPUT_MAX_EDGE;

export type AdminImageMeta = {
  fileName: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  /** 투명 픽셀이 있는가(PNG·WebP) — 알 수 없으면 null */
  hasAlpha: boolean | null;
};

export type AdminImageIssue =
  | { level: "error"; code: "type"; allowed: string }
  | { level: "error"; code: "bytes"; maxMb: number }
  | { level: "error"; code: "small_long"; min: number }
  | { level: "error"; code: "small_short"; min: number }
  | { level: "error"; code: "small_crop"; minWidth: number; minHeight: number; cropWidth: number; cropHeight: number }
  | { level: "error"; code: "large_edge"; max: number }
  | { level: "error"; code: "pixels" }
  | { level: "error"; code: "need_alpha" }
  | { level: "warn"; code: "needs_crop"; cropWidth: number; cropHeight: number }
  | { level: "warn"; code: "ratio_bg"; recommended: string };

export type AdminImageCheck = { level: "ok" | "warn" | "error"; issues: AdminImageIssue[] };

/** 비율 고정 칸에서 가운데를 그 비율로 자를 때의 크기 */
export function cropSizeForRatio(width: number, height: number, ratio: { w: number; h: number }) {
  const cropWidth = Math.min(width, Math.floor((height * ratio.w) / ratio.h));
  const cropHeight = Math.min(height, Math.floor((width * ratio.h) / ratio.w));
  return { cropWidth, cropHeight };
}

export function checkAdminImage(meta: AdminImageMeta, spec: AdminImageSlotSpec): AdminImageCheck {
  const issues: AdminImageIssue[] = [];
  const long = Math.max(meta.width, meta.height);
  const short = Math.min(meta.width, meta.height);
  if (!(spec.mimes as readonly string[]).includes(meta.mime)) {
    issues.push({ level: "error", code: "type", allowed: spec.mimes.map((m) => m.split("/")[1].toUpperCase()).join("·") });
  }
  if (meta.bytes > spec.maxBytes) issues.push({ level: "error", code: "bytes", maxMb: Math.round(spec.maxBytes / 1048576) });
  if (spec.maxPixels && meta.width * meta.height > spec.maxPixels) issues.push({ level: "error", code: "pixels" });
  if (spec.maxLongEdge && long > spec.maxLongEdge) issues.push({ level: "error", code: "large_edge", max: spec.maxLongEdge });
  if (spec.minLongEdge && long < spec.minLongEdge) issues.push({ level: "error", code: "small_long", min: spec.minLongEdge });
  if (spec.minShortEdge && short < spec.minShortEdge) issues.push({ level: "error", code: "small_short", min: spec.minShortEdge });
  if (spec.ratio) {
    const { cropWidth, cropHeight } = cropSizeForRatio(meta.width, meta.height, spec.ratio);
    if (cropWidth < spec.ratio.minWidth || cropHeight < spec.ratio.minHeight) {
      issues.push({
        level: "error",
        code: "small_crop",
        minWidth: spec.ratio.minWidth,
        minHeight: spec.ratio.minHeight,
        cropWidth,
        cropHeight,
      });
    } else if (Math.abs(meta.width * spec.ratio.h - meta.height * spec.ratio.w) > Math.max(meta.width, meta.height) * 0.01) {
      issues.push({ level: "warn", code: "needs_crop", cropWidth, cropHeight });
    }
  }
  if (spec.transparency === "required" && meta.hasAlpha === false) issues.push({ level: "error", code: "need_alpha" });
  if (spec.fit === "contain_bg") {
    const want = spec.recommended.width / spec.recommended.height;
    const got = meta.width / meta.height;
    if (Math.abs(got - want) / want > 0.08) {
      issues.push({ level: "warn", code: "ratio_bg", recommended: `${spec.recommended.width}×${spec.recommended.height}` });
    }
  }
  const level = issues.some((i) => i.level === "error") ? "error" : issues.length ? "warn" : "ok";
  return { level, issues };
}
