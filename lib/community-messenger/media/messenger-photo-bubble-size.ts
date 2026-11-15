/**
 * 메신저 사진 말풍선 크기 SSOT (M2 · `docs/design/messenger-media-emoji-ssot-design-2026-11-15.md`).
 *
 * 높이 규칙은 텔레그램 원문 그대로 (`ChatMessageCell.java:9155`, `:9264-9276`):
 * - 사진을 최대 폭에 맞춘 높이 = 폭 × h / w
 * - 최대 높이 = 폭 + 100 → 넘으면 **폭을 줄여 비율 유지**(자르지 않음)
 * - 최소 높이 = 120 → 그보다 낮으면 120 으로 두고 그때만 가운데 자름
 *
 * 최대 폭은 지금 말풍선 폭(화면 62% · 280/320/360 상한)을 유지한다 — DIBAY 는 시간 표시가 사진 옆에 붙어
 * 텔레그램의 「가로 사진 = 화면 − 64」 폭을 쓰면 줄을 넘친다(시간을 사진 위로 옮길지는 Owner 결정).
 * 크기 정보가 없는 지난 사진은 4:5 로 고정하고 불러온 뒤에도 칸을 바꾸지 않는다(밀림 0).
 */

export const MESSENGER_PHOTO_BUBBLE_EXTRA_MAX_HEIGHT_PX = 100;
export const MESSENGER_PHOTO_BUBBLE_MIN_HEIGHT_PX = 120;
/** 크기 정보 없는 사진의 고정 비율 (가로 / 세로) */
export const MESSENGER_PHOTO_BUBBLE_FALLBACK_AR = 4 / 5;

/** 지금 말풍선 폭 규칙(`w-[min(62vw,280px)] sm:320 md:360`)을 px 로. */
export function messengerPhotoBubbleMaxWidthPx(viewportWidth: number): number {
  const vw = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 384;
  const cap = vw >= 768 ? 360 : vw >= 640 ? 320 : 280;
  return Math.round(Math.min(vw * 0.62, cap));
}

export type MessengerPhotoBubbleSize = { width: number; height: number };

/** 사진 원본 가로·세로(비율만 쓴다)와 최대 폭 → 말풍선 칸 크기(px). */
export function messengerPhotoBubbleSize(input: {
  photoWidth: number | null | undefined;
  photoHeight: number | null | undefined;
  maxWidth: number;
}): MessengerPhotoBubbleSize {
  const maxW = Math.max(1, Math.round(input.maxWidth));
  const w = Number(input.photoWidth);
  const h = Number(input.photoHeight);
  const ar = w > 0 && h > 0 && Number.isFinite(w) && Number.isFinite(h) ? w / h : MESSENGER_PHOTO_BUBBLE_FALLBACK_AR;
  const maxH = maxW + MESSENGER_PHOTO_BUBBLE_EXTRA_MAX_HEIGHT_PX;
  let width = maxW;
  let height = maxW / ar;
  if (height > maxH) {
    height = maxH;
    width = maxH * ar;
  } else if (height < MESSENGER_PHOTO_BUBBLE_MIN_HEIGHT_PX) {
    height = MESSENGER_PHOTO_BUBBLE_MIN_HEIGHT_PX;
  }
  return { width: Math.round(width), height: Math.round(height) };
}
