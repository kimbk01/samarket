/**
 * Result count labels — distinguish page / filtered / global.
 */
export type ResultCountKind = "CURRENT_PAGE" | "FILTERED_TOTAL" | "GLOBAL_TOTAL";

export const RESULT_COUNT_LABEL = {
  CURRENT_PAGE: {
    i18nKey: "admin_mgmt_count_current_page",
    fallbackKo: "현재 페이지",
    fallbackEn: "Current page",
  },
  FILTERED_TOTAL: {
    i18nKey: "admin_mgmt_count_filtered_total",
    fallbackKo: "필터 결과",
    fallbackEn: "Filtered total",
  },
  GLOBAL_TOTAL: {
    i18nKey: "admin_mgmt_count_global_total",
    fallbackKo: "전체",
    fallbackEn: "Global total",
  },
} as const satisfies Record<
  ResultCountKind,
  { i18nKey: string; fallbackKo: string; fallbackEn: string }
>;
