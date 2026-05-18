import { isCompletePhMobile, parsePhMobileInput } from "@/lib/utils/ph-mobile";

export type StoreCheckoutPhoneSources = {
  selectedAddressPhone?: string | null;
  defaultDeliveryPhone?: string | null;
  checkoutContactPhone?: string | null;
  profilePhone?: string | null;
  currentDigits?: string | null;
};

/**
 * 장바구니 주문 연락처 — 완전한 09 번호 우선, 없으면 부분 입력·기존 값 유지.
 */
export function resolveStoreCheckoutBuyerPhoneDigits(
  sources: StoreCheckoutPhoneSources
): string {
  const current = parsePhMobileInput(sources.currentDigits ?? "");
  if (isCompletePhMobile(current)) return current;

  const candidates = [
    sources.selectedAddressPhone,
    sources.defaultDeliveryPhone,
    sources.checkoutContactPhone,
    sources.profilePhone,
  ];

  for (const raw of candidates) {
    const d = parsePhMobileInput(raw ?? "");
    if (isCompletePhMobile(d)) return d;
  }

  for (const raw of candidates) {
    const d = parsePhMobileInput(raw ?? "");
    if (d.length > 0) return d;
  }

  return current;
}
