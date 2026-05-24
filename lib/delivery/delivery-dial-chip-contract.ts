/**
 * CONTRACT — 배달 홈 다이얼 칩 DOM·상호작용 (overlay·CSS·스와이프 분기 단일 소스).
 * DO NOT: 클래스명을 overlay·CSS·verify 스크립트에 각각 하드코딩 — 여기만 수정.
 */
export const DELIVERY_DIAL_CHIP_HIT_CLASS = "delivery-domain-switcher-hit";

export const DELIVERY_DIAL_CHIP_HIT_CURRENT_MODIFIER = `${DELIVERY_DIAL_CHIP_HIT_CLASS}--current`;

export const DELIVERY_DIAL_CHIP_HIT_SELECTOR = `.${DELIVERY_DIAL_CHIP_HIT_CLASS}`;

/** CSS `--open`(`entered`)과 동기 — 닫힘 애니 중 `pointer-events:none` */
export function isDeliveryDialChipInteractionReady(
  open: boolean,
  portalReady: boolean,
  entered: boolean
): boolean {
  return open && portalReady && entered;
}
