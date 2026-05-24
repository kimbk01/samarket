import { DELIVERY_HOME_HUB_LONG_PRESS_MS } from "@/lib/delivery/delivery-home-hub-navigation";

export { DELIVERY_HOME_HUB_LONG_PRESS_MS };

/** 짧은 탭 pointerup — 롱프레스 직후가 아니면 다이얼 토글 */
export function shouldDeliveryHomeHubShortTapToggleDial(longPressFired: boolean): boolean {
  return !longPressFired;
}

/** @deprecated — `shouldDeliveryHomeHubShortTapToggleDial` */
export function shouldToggleDeliveryDialOnHomePointerUp(longPressFired: boolean): boolean {
  return !longPressFired;
}
