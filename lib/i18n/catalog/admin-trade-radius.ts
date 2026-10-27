/**
 * 거래 D (Owner 2026-10-28) — 어드민 「지역 정책」 거래 반경 칸 문구.
 * `adminMessages`(admin.ts) 타입 길이 한도(TS7056)를 넘지 않게 별도 카탈로그로 둔다(선례 `admin-users-address`).
 */
export const adminTradeRadiusMessages = {
  ko: {
    admin_settings_key_trade_radius_options: "거래 반경 선택지(km)",
    admin_settings_key_trade_default_radius: "거래 기본 반경",
    admin_settings_region_trade_radius_options: "거래 반경 선택지 (km, 쉼표로 구분 · 최대 6개)",
    admin_settings_region_trade_radius_options_hint:
      "거래 📍 위치에서 고를 반경입니다. 「전체」는 항상 함께 보입니다. 예: 10, 20, 40",
    admin_settings_region_trade_default_radius: "거래 기본 반경 (새 지역을 고를 때 미리 선택)",
    admin_settings_region_trade_radius_all: "전체",
  },
  en: {
    admin_settings_key_trade_radius_options: "Trade radius options (km)",
    admin_settings_key_trade_default_radius: "Trade default radius",
    admin_settings_region_trade_radius_options: "Trade radius options (km, comma separated · up to 6)",
    admin_settings_region_trade_radius_options_hint:
      "Radius choices in the trade location sheet. \"All\" is always shown. e.g. 10, 20, 40",
    admin_settings_region_trade_default_radius: "Trade default radius (preselected for a new area)",
    admin_settings_region_trade_radius_all: "All",
  },
} as const;
