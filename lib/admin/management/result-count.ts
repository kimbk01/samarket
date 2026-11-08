/**
 * Result count labels — distinguish page / filtered / global.
 * 언어 SSOT B4: 문구는 카탈로그 키만 (대체 문구 제거).
 */
import type { MessageKey } from "@/lib/i18n/messages";

export type ResultCountKind = "CURRENT_PAGE" | "FILTERED_TOTAL" | "GLOBAL_TOTAL";

export const RESULT_COUNT_LABEL = {
  CURRENT_PAGE: {
    i18nKey: "admin_mgmt_count_current_page",
  },
  FILTERED_TOTAL: {
    i18nKey: "admin_mgmt_count_filtered_total",
  },
  GLOBAL_TOTAL: {
    i18nKey: "admin_mgmt_count_global_total",
  },
} as const satisfies Record<
  ResultCountKind,
  { i18nKey: MessageKey }
>;
