import type { UserAddressLabelType } from "@/lib/addresses/user-address-types";

/** 배민형 칩 저장 시 `nickname` 에 넣는 고정 문자열 */
export const ADDRESS_PRESET_NICKNAME_HOME = "우리집";
export const ADDRESS_PRESET_NICKNAME_OFFICE = "회사";

export const ADDRESS_LABEL_KO: Record<UserAddressLabelType, string> = {
  home: "집",
  office: "회사",
  shop: "매장",
  other: "기타",
};
