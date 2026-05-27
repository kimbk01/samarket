import type { DeliveryHomeHeaderAddressState } from "@/lib/addresses/delivery-home-header-address";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";

export type DeliveryHomeHeaderLabelInput = DeliveryHomeHeaderAddressState & {
  displayLine: string | null;
};

/**
 * CONTRACT — `/stores` 헤더 버튼 라벨 단일 출처.
 * DO NOT: `store_address_manage_link` 를 헤더 버튼 텍스트로 쓰지 않는다(시트 링크 전용).
 */
export function resolveDeliveryHomeHeaderButtonLabel(
  view: DeliveryHomeHeaderLabelInput,
  lang = getRuntimeAppLanguage(),
): string {
  const trimmed = view.displayLine?.trim();
  if (trimmed) return trimmed;

  let key: MessageKey;
  if (view.status === "loading") {
    key = "philife_addr_loading_line";
  } else if (view.hasLinkedAddress) {
    key = "philife_addr_not_set";
  } else {
    key = "addr_ui_add_first";
  }
  return translate(lang, key);
}
