/**
 * CUT 5-R — pure geometry for 36:25 center crop (client + server safe).
 */

import { PLATFORM_POPUP_CREATIVE_ASPECT } from "@/lib/platform-popup/types";

export const PLATFORM_POPUP_CREATIVE_RATIO_EPS = 0.01;

export const PLATFORM_POPUP_TARGET_RATIO =
  PLATFORM_POPUP_CREATIVE_ASPECT.w / PLATFORM_POPUP_CREATIVE_ASPECT.h;

export type PlatformPopupCenterCropBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function centerCropBoxTo3625(
  width: number,
  height: number
): PlatformPopupCenterCropBox {
  const current = width / height;
  if (current > PLATFORM_POPUP_TARGET_RATIO) {
    const cropW = Math.round(height * PLATFORM_POPUP_TARGET_RATIO);
    return { left: Math.floor((width - cropW) / 2), top: 0, width: cropW, height };
  }
  const cropH = Math.round(width / PLATFORM_POPUP_TARGET_RATIO);
  return { left: 0, top: Math.floor((height - cropH) / 2), width, height: cropH };
}

export function isPlatformPopupCreativeRatioOk(width: number, height: number): boolean {
  if (!(width > 0) || !(height > 0)) return false;
  return Math.abs(width / height - PLATFORM_POPUP_TARGET_RATIO) <= PLATFORM_POPUP_CREATIVE_RATIO_EPS;
}

/**
 * v3 ④ (앱 진입 어드민 §4 · Owner 2026-11-17 「v3대로 진행」) — 운영자가 끌어서 고른 36:25 자르기 틀(원본 픽셀).
 * 화면(자르기 틀 결과 표시)과 서버(`processPlatformPopupCreativeToCanonical`)가 같은 검사를 쓴다.
 * - 정수 · 원본 안(0 ≤ x, y · x+w ≤ 원본 폭 · y+h ≤ 원본 높이)
 * - 비율 36:25 ±1% · 자른 뒤 최소 720×500 (`creative-size-spec.ts` POPUP_CARD_MIN_SOURCE 와 같은 값)
 */
export type PlatformPopupCropRect = { x: number; y: number; width: number; height: number };

export const PLATFORM_POPUP_CROP_MIN = { width: 720, height: 500 } as const;
/** 비율 허용 폭(상대) — 1% */
export const PLATFORM_POPUP_CROP_RATIO_TOLERANCE = 0.01;

export type PlatformPopupCropRectError =
  | "crop_rect_invalid"
  | "crop_rect_out_of_bounds"
  | "crop_rect_ratio"
  | "crop_rect_too_small";

export function validatePlatformPopupCropRect(
  rect: PlatformPopupCropRect,
  source: { width: number; height: number }
): { ok: true; rect: PlatformPopupCropRect } | { ok: false; error: PlatformPopupCropRectError } {
  const { x, y, width, height } = rect;
  if (![x, y, width, height].every((v) => Number.isInteger(v)) || !(width > 0) || !(height > 0)) {
    return { ok: false, error: "crop_rect_invalid" };
  }
  if (x < 0 || y < 0 || x + width > source.width || y + height > source.height) {
    return { ok: false, error: "crop_rect_out_of_bounds" };
  }
  if (
    Math.abs(width / height - PLATFORM_POPUP_TARGET_RATIO) / PLATFORM_POPUP_TARGET_RATIO >
    PLATFORM_POPUP_CROP_RATIO_TOLERANCE
  ) {
    return { ok: false, error: "crop_rect_ratio" };
  }
  if (width < PLATFORM_POPUP_CROP_MIN.width || height < PLATFORM_POPUP_CROP_MIN.height) {
    return { ok: false, error: "crop_rect_too_small" };
  }
  return { ok: true, rect: { x, y, width, height } };
}

/** 폼 값(문자열) → 자르기 틀. 네 값이 모두 없으면 null(가운데 자르기 · 기존 동작), 일부만·숫자 아님 = invalid */
export function parsePlatformPopupCropRectFields(fields: {
  x: unknown;
  y: unknown;
  width: unknown;
  height: unknown;
}): { ok: true; rect: PlatformPopupCropRect | null } | { ok: false; error: "crop_rect_invalid" } {
  const raw = [fields.x, fields.y, fields.width, fields.height].map((v) => (v == null ? "" : String(v).trim()));
  if (raw.every((v) => v === "")) return { ok: true, rect: null };
  if (raw.some((v) => !/^\d{1,6}$/.test(v))) return { ok: false, error: "crop_rect_invalid" };
  const [x, y, width, height] = raw.map((v) => Number(v)) as [number, number, number, number];
  return { ok: true, rect: { x, y, width, height } };
}
