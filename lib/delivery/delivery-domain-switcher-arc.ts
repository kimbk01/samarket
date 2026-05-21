/**
 * 배달 도메인 스위처 — 반원 호(180°), 아이콘 원 + 라벨 pill, 하단 탭 24px 아이콘.
 */

export const DELIVERY_DIAL_ANIM_MS = 440;
export const DELIVERY_DIAL_STAGGER_MS = 88;

export const DELIVERY_DIAL_SLOT_COUNT = 6;
/** 원형 칩 — 24px 아이콘만(라벨은 원 밖 pill) */
export const DELIVERY_DIAL_CHIP_SIZE_REM = 2.75;
export const DELIVERY_DIAL_CHIP_SIZE_PX = 44;
/** 슬롯 박스 — pill 라벨·호상 chord */
export const DELIVERY_DIAL_SLOT_WIDTH_REM = 4.25;
export const DELIVERY_DIAL_SLOT_WIDTH_PX = 68;
export const DELIVERY_DIAL_SLOT_GAP = 1.06;
export const DELIVERY_DIAL_ARC_HALF_SPAN_DEG = 90;
export const DELIVERY_DIAL_VIEWPORT_EDGE_PADDING_PX = 10;
export const DELIVERY_DIAL_PIVOT_BOTTOM_REM = 1.35;

export function deliveryDialArcStepDeg(total: number): number {
  if (total <= 1) return 0;
  return (DELIVERY_DIAL_ARC_HALF_SPAN_DEG * 2) / (total - 1);
}

export function deliveryDialRadiusPx(total = DELIVERY_DIAL_SLOT_COUNT): number {
  const step = deliveryDialArcStepDeg(total);
  if (step <= 0) return DELIVERY_DIAL_CHIP_SIZE_PX;
  const halfStepRad = ((step / 2) * Math.PI) / 180;
  const chord = DELIVERY_DIAL_SLOT_WIDTH_PX * DELIVERY_DIAL_SLOT_GAP;
  return Math.ceil(chord / (2 * Math.sin(halfStepRad)));
}

/** 모바일 폭 — 양끝 칩이 화면 밖으로 나가지 않도록 반경 상한 */
export function deliveryDialRadiusPxBounded(
  viewportWidthPx: number,
  total = DELIVERY_DIAL_SLOT_COUNT,
  edgePaddingPx = DELIVERY_DIAL_VIEWPORT_EDGE_PADDING_PX
): number {
  const ideal = deliveryDialRadiusPx(total);
  if (!Number.isFinite(viewportWidthPx) || viewportWidthPx <= 0) return ideal;
  const extentHalf = DELIVERY_DIAL_SLOT_WIDTH_PX / 2;
  const maxByViewport = Math.floor(viewportWidthPx / 2 - extentHalf - edgePaddingPx);
  const minUsable = DELIVERY_DIAL_CHIP_SIZE_PX / 2 + 24;
  return Math.min(ideal, Math.max(minUsable, maxByViewport));
}

export function deliveryDialItemAngleDeg(index: number, total: number): number {
  if (total <= 1) return 0;
  const step = deliveryDialArcStepDeg(total);
  return -DELIVERY_DIAL_ARC_HALF_SPAN_DEG + index * step;
}

export function deliveryDialSweepStartDeg(total: number): number {
  return deliveryDialItemAngleDeg(0, total);
}

/** 수평 스와이프 1px 당 호 회전(deg) — 시계방향=양수 */
export const DELIVERY_DIAL_SWIPE_DEG_PER_PX = 0.52;

export function snapDeliveryDialRotationDeg(rotationDeg: number, total: number): number {
  const step = deliveryDialArcStepDeg(total);
  if (step <= 0) return 0;
  return Math.round(rotationDeg / step) * step;
}

/** 시계방향 오픈 시 아이템 등장 순서(좌→우, index 0 먼저) */
export function deliveryDialOpenStaggerDelayMs(index: number): number {
  return index * DELIVERY_DIAL_STAGGER_MS;
}

/** 닫힘 — 우→좌(역시계) */
export function deliveryDialCloseStaggerDelayMs(index: number, total: number): number {
  return (total - 1 - index) * DELIVERY_DIAL_STAGGER_MS;
}

/** 열림·닫힘 전체 길이(마지막 스태거 + 본 트랜지션) */
export function deliveryDialAnimTotalMs(total = DELIVERY_DIAL_SLOT_COUNT): number {
  if (total <= 0) return DELIVERY_DIAL_ANIM_MS;
  return DELIVERY_DIAL_ANIM_MS + (total - 1) * DELIVERY_DIAL_STAGGER_MS;
}
