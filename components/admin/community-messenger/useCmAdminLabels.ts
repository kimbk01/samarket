"use client";

import { useCallback, useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS,
  type CommunityMessengerCallForceEndReasonCode,
} from "@/lib/admin-community-messenger/call-force-end-reasons";
import { cmAdminLocale } from "./cm-admin-locale";

const FORCE_END_REASON_KEYS: Record<CommunityMessengerCallForceEndReasonCode, MessageKey> = {
  policy_violation: "admin_cm_force_end_reason_policy_violation",
  abuse_report: "admin_cm_force_end_reason_abuse_report",
  spam_or_ad: "admin_cm_force_end_reason_spam_or_ad",
  safety_risk: "admin_cm_force_end_reason_safety_risk",
  user_request: "admin_cm_force_end_reason_user_request",
  other: "admin_cm_force_end_reason_other",
};

const WEEKDAY_KEYS = [
  "admin_cm_weekday_sun",
  "admin_cm_weekday_mon",
  "admin_cm_weekday_tue",
  "admin_cm_weekday_wed",
  "admin_cm_weekday_thu",
  "admin_cm_weekday_fri",
  "admin_cm_weekday_sat",
] as const satisfies readonly MessageKey[];

const PERIOD_KEYS = {
  "24h": "admin_cm_period_24h",
  "7d": "admin_cm_period_7d",
  "30d": "admin_cm_period_30d",
} as const satisfies Record<"24h" | "7d" | "30d", MessageKey>;

const ROOM_TYPE_KEYS = {
  direct: "admin_cm_room_type_direct",
  private_group: "admin_cm_room_type_private_group",
  open_group: "admin_cm_room_type_open_group",
  unknown: "admin_cm_room_type_unknown",
} as const satisfies Record<"direct" | "private_group" | "open_group" | "unknown", MessageKey>;

export function useCmAdminLabels() {
  const { t, language } = useI18n();
  const locale = cmAdminLocale(language);

  const formatDateTime = useCallback(
    (value: string) => {
      if (!value) return t("admin_cm_common_dash");
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) return value;
      return date.toLocaleString(locale);
    },
    [locale, t]
  );

  const periodLabel = useCallback((period: "24h" | "7d" | "30d") => t(PERIOD_KEYS[period]), [t]);

  const roomTypeLabel = useCallback(
    (roomType: "direct" | "private_group" | "open_group" | "unknown") => t(ROOM_TYPE_KEYS[roomType]),
    [t]
  );

  const forceEndReasonLabel = useCallback(
    (code: string) => {
      if (code in FORCE_END_REASON_KEYS) {
        return t(FORCE_END_REASON_KEYS[code as CommunityMessengerCallForceEndReasonCode]);
      }
      return t("admin_cm_force_end_reason_unknown");
    },
    [t]
  );

  const weekdays = useMemo(() => WEEKDAY_KEYS.map((key) => t(key)), [t]);

  const heatmapHours = useMemo(
    () => Array.from({ length: 24 }, (_, hour) => t("admin_cm_hour_label", { hour: String(hour).padStart(2, "0") })),
    [t]
  );

  const heatmapHourHeader = useCallback(
    (hour: number) => t("admin_cm_hour_header", { hour: String(hour).padStart(2, "0") }),
    [t]
  );

  const heatmapCellTitle = useCallback(
    (weekday: string, hour: number, count: number) =>
      t("admin_cm_heatmap_cell_title", {
        weekday,
        hour: String(hour).padStart(2, "0"),
        count,
      }),
    [t]
  );

  const heatmapSlotLabel = useCallback(
    (weekdayIndex: number, hour: number) =>
      t("admin_cm_heatmap_slot_label", {
        weekday: weekdays[weekdayIndex] ?? "",
        hour: String(hour).padStart(2, "0"),
      }),
    [t, weekdays]
  );

  const adminUnknownLabel = useCallback(() => t("admin_cm_admin_unknown"), [t]);

  const defaultRoomLabel = useCallback(() => t("admin_cm_default_room_title"), [t]);

  const forceEndReasonOptions = useMemo(
    () =>
      COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS.map((reason) => ({
        code: reason.code,
        label: t(FORCE_END_REASON_KEYS[reason.code]),
      })),
    [t]
  );

  return {
    t,
    locale,
    formatDateTime,
    periodLabel,
    roomTypeLabel,
    forceEndReasonLabel,
    weekdays,
    heatmapHours,
    heatmapHourHeader,
    heatmapCellTitle,
    heatmapSlotLabel,
    adminUnknownLabel,
    defaultRoomLabel,
    forceEndReasonOptions,
  };
}

export type CmAdminTranslate = ReturnType<typeof useCmAdminLabels>["t"];

export function cmForceEndReasonLabel(t: CmAdminTranslate, code: string) {
  if (code in FORCE_END_REASON_KEYS) {
    return t(FORCE_END_REASON_KEYS[code as CommunityMessengerCallForceEndReasonCode]);
  }
  return t("admin_cm_force_end_reason_unknown");
}

export function cmWeekdays(t: CmAdminTranslate): string[] {
  return WEEKDAY_KEYS.map((key) => t(key));
}
