import type { MessageKey } from "@/lib/i18n/messages";

/** 배민형 칩 저장 시 `nickname` — UI 언어에 맞춰 i18n 키에서 해석 */
export function resolveAddressPresetNickname(
  preset: "home" | "office",
  translate: (key: MessageKey) => string
): string {
  return preset === "home" ? translate("addr_ui_preset_home") : translate("addr_ui_preset_office");
}
