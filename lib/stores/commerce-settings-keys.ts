/** admin_settings.key — value_json: { "value": number } */
export const COMMERCE_SETTING_KEYS = {
  autoCompleteDays: "store_auto_complete_days",
  settlementFeeBp: "store_settlement_fee_bp",
  settlementDelayDays: "store_settlement_delay_days",
} as const;

export type CommerceSettingKey =
  (typeof COMMERCE_SETTING_KEYS)[keyof typeof COMMERCE_SETTING_KEYS];
