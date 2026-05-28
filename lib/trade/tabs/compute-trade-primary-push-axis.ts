import type { MainShellRoutePushAxis } from "@/components/route-transition/route-transition-config";

/**
 * 거래 1차 탭 push 축 — canonical 5탭 인덱스가 아닌 **탭 배열 순서**만 사용.
 * `/market` ↔ `/market/[slug]` 는 canonical 상 동일 market(1)이라 subtle 로 떨어지면 안 됨.
 */
export function computeTradePrimaryPushAxis(
  fromTabIndex: number,
  toTabIndex: number
): MainShellRoutePushAxis | null {
  if (fromTabIndex < 0 || toTabIndex < 0 || fromTabIndex === toTabIndex) return null;
  return toTabIndex > fromTabIndex ? "ltr" : "rtl";
}
