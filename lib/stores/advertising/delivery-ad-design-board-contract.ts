/**
 * DIBAY Delivery Ads — UI/UX design board SSOT (attached spec).
 * All Owner/Admin/Customer presentation MUST reference this file — no ad-hoc copy/layout.
 */

/** Design system — attached board bottom row */
export const DELIVERY_AD_DESIGN_BOARD = {
  colorPrimary: "#0A823E",
  colorPrimaryHover: "#087a38",
  colorPrimarySoft: "#7AC29A",
  colorAdTag: "#FF8A00",
  colorGrey700: "#757575",
  colorGrey400: "#BDBDBD",
  colorGrey100: "#F5F5F5",
  colorDanger: "#E53935",
  colorReviewBlue: "#2563EB",
} as const;

/** Owner hub — screen 1 광고 관리 허브 */
export const DELIVERY_AD_OWNER_HUB_CONTRACT = {
  greetingKey: "owner_ads_hub_greeting",
  greetingFallbackKey: "owner_ads_hub_greeting_fallback",
  titleKey: "owner_delivery_ads_hub_title",
  primaryCtaKey: "owner_ads_apply_primary_cta",
  recentAdsTitleKey: "owner_ads_hub_recent_ads",
  partnerCardAfterList: true,
  kpiLabelKeys: [
    "owner_ads_summary_active",
    "owner_ads_summary_under_review",
    "owner_ads_summary_scheduled",
    "owner_ads_summary_ended",
  ] as const,
} as const;

/** Owner application — screens 2–5 single workspace section order */
export const DELIVERY_AD_OWNER_APPLICATION_SECTIONS = [
  { id: "store", titleKey: "owner_ads_section_store" },
  { id: "product", titleKey: "owner_ads_section_product" },
  { id: "placement", titleKey: "owner_ads_section_placement" },
  { id: "packages", titleKey: "owner_ads_section_packages" },
  { id: "period", titleKey: "owner_ads_section_period" },
  { id: "preview", titleKey: "owner_ads_section_preview" },
  { id: "confirm", titleKey: "owner_ads_section_confirm" },
  { id: "payable", titleKey: "owner_ads_section_payable" },
] as const;

export const DELIVERY_AD_OWNER_APPLICATION_STEPS = [
  { step: 1, labelKey: "owner_ads_step_store" },
  { step: 2, labelKey: "owner_ads_step_product_placement" },
  { step: 3, labelKey: "owner_ads_step_package_price" },
  { step: 4, labelKey: "owner_ads_step_preview" },
  { step: 5, labelKey: "owner_ads_step_confirm" },
] as const;

/** Package card durations shown on board when priced */
export const DELIVERY_AD_DESIGN_BOARD_PACKAGE_DAYS = [7, 15, 30] as const;

/** Admin hub — screen 1 */
export const DELIVERY_AD_ADMIN_HUB_CONTRACT = {
  titleKey: "admin_delivery_ads_title",
  subtitleKey: "admin_delivery_ads_subtitle",
  todaySummaryKey: "admin_delivery_ads_today_summary",
  todoListKey: "admin_delivery_ads_action_queue_title",
  firstPartyCtaKey: "admin_delivery_ads_first_party_cta",
  todaySummaryBuckets: [
    { id: "new", labelKey: "admin_delivery_ads_today_new" },
    { id: "pending_review", labelKey: "admin_delivery_ads_today_pending_review" },
    { id: "pending_payment", labelKey: "admin_delivery_ads_today_pending_payment" },
    { id: "active", labelKey: "admin_delivery_ads_today_active" },
  ] as const,
} as const;

/** Owner Partner — design board bottom row (4 steps) */
export const DELIVERY_AD_OWNER_PARTNER_STEPS = [
  { step: 1, labelKey: "owner_ads_partner_step_intro" },
  { step: 2, labelKey: "owner_ads_partner_step_apply" },
  { step: 3, labelKey: "owner_ads_partner_step_payment" },
  { step: 4, labelKey: "owner_ads_partner_step_active" },
] as const;

/** Customer ad tag — orange badge on store list / banner */
export const DELIVERY_AD_CUSTOMER_AD_TAG_CLASS =
  "inline-flex h-[19px] items-center rounded-[5px] bg-[#FF8A00] px-1.5 text-[10px] font-semibold leading-none text-white";

/** Owner confirm — 3-step timeline (board screen 5) */
export const DELIVERY_AD_OWNER_CONFIRM_TIMELINE = [
  { step: 1, labelKey: "owner_ads_confirm_timeline_review" },
  { step: 2, labelKey: "owner_ads_confirm_timeline_payment" },
  { step: 3, labelKey: "owner_ads_confirm_timeline_start" },
] as const;

/** Admin first-party — 4 steps */
export const DELIVERY_AD_ADMIN_FIRST_PARTY_STEPS = [
  { step: 1, labelKey: "admin_delivery_ads_fp_step_setup" },
  { step: 2, labelKey: "admin_delivery_ads_fp_step_produce" },
  { step: 3, labelKey: "admin_delivery_ads_fp_step_review" },
  { step: 4, labelKey: "admin_delivery_ads_fp_step_publish" },
] as const;

/** Admin action queue table columns */
export const DELIVERY_AD_ADMIN_ACTION_QUEUE_COLUMNS = [
  { id: "store", labelKey: "admin_delivery_ads_queue_col_store" },
  { id: "product", labelKey: "admin_delivery_ads_queue_col_product" },
  { id: "status", labelKey: "admin_delivery_ads_queue_col_status" },
  { id: "date", labelKey: "admin_delivery_ads_queue_col_date" },
] as const;

/** Admin commercial — price matrix screen */
export const DELIVERY_AD_ADMIN_COMMERCIAL_CONTRACT = {
  titleKey: "admin_delivery_ads_commercial_title",
  matrixDurationDays: [7, 15, 30] as const,
  unsetLabelKey: "admin_delivery_ads_price_unset",
} as const;
