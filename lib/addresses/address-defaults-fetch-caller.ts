/**
 * Canonical callers for GET /api/me/address-defaults — pass through fetchAddressDefaultsSnapshot.
 */
export const ADDRESS_DEFAULTS_FETCH_CALLERS = [
  "mypage_home_model",
  "mypage_hub_model",
  "representative_address_presentation",
  "representative_address_line",
  "representative_full_address_line",
  "delivery_home_header_address",
  "trade_default_location_block",
  "trade_meet_spot_pick",
  "business_apply_form",
  "browse_list_user_origin",
  "trade_meet_fallback_line",
  "trade_location_scope",
  "unknown",
] as const;

export type AddressDefaultsFetchCaller = (typeof ADDRESS_DEFAULTS_FETCH_CALLERS)[number];

export type AddressDefaultsFetchReason =
  | "initial_required_info_resolution"
  | "force_addresses_updated"
  | "pathname_silent_refresh"
  | "boot_retry"
  | "popstate_silent_refresh"
  | "auth_changed"
  | "hub_model_refresh"
  | "header_address_load"
  | "composer_default_location"
  | "meet_spot_seed"
  | "apply_form_seed"
  | "browse_origin"
  | "fallback_line"
  | "trade_location_panel"
  | "trade_location_seed"
  | "unspecified";
