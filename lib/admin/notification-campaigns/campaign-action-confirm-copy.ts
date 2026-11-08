/**
 * Confirm-dialog copy for admin notification campaign mutations (client-safe).
 * Every dialog re-shows 대상 수 · 채널 · 시각 before the action runs.
 * Display text comes from the i18n catalog (`admin_campaign_cms_confirm_*`) — 언어 SSOT B4: 대체 문구 표 제거.
 */

import { safeTranslate } from "@/lib/i18n/safe-translate";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";

export const CAMPAIGN_CONFIRM_ACTIONS = [
  "send",
  "schedule",
  "cancel",
  "cancel_occurrence",
  "stop_sending",
  "pause",
  "resume",
  "stop_recurring",
  "resend",
  "archive",
  "unarchive",
  "duplicate",
  "save_edit",
] as const;

export type CampaignConfirmAction = (typeof CAMPAIGN_CONFIRM_ACTIONS)[number];

export type CampaignConfirmFacts = {
  /** null → unknown (shown as "—"). */
  targetCount: number | null;
  /** Push-eligible members, when an audience preview was loaded. */
  pushEligibleCount?: number | null;
  channelLabel: string;
  /** Human time line (예: "즉시", "2027-05-20 09:00 예약"). */
  timeLabel: string;
  title?: string;
};

export type CampaignConfirmCopy = {
  title: string;
  description: string;
  confirmLabel: string;
  tone: "primary" | "danger";
};

/** 확인창 색 — 문구는 카탈로그 `admin_campaign_cms_confirm_{action}_{title|desc|confirm}` (13개 동작 × 3, 모두 있음). */
const TONE: Record<CampaignConfirmAction, CampaignConfirmCopy["tone"]> = {
  send: "danger",
  schedule: "primary",
  cancel: "danger",
  cancel_occurrence: "danger",
  stop_sending: "danger",
  pause: "primary",
  resume: "primary",
  stop_recurring: "danger",
  resend: "danger",
  archive: "primary",
  unarchive: "primary",
  duplicate: "primary",
  save_edit: "primary",
};

export function campaignConfirmCopy(action: CampaignConfirmAction, lang: "ko" | "en" = "ko"): CampaignConfirmCopy {
  return {
    title: safeTranslate(lang, `admin_campaign_cms_confirm_${action}_title`),
    description: safeTranslate(lang, `admin_campaign_cms_confirm_${action}_desc`),
    confirmLabel: safeTranslate(lang, `admin_campaign_cms_confirm_${action}_confirm`),
    tone: TONE[action],
  };
}

/** Fact lines (대상 수 · 채널 · 시각) shown in every confirm dialog. */
export function campaignConfirmFactLines(facts: CampaignConfirmFacts, lang: "ko" | "en" = "ko"): string[] {
  const n = (v: number | null | undefined) =>
    typeof v === "number" && Number.isFinite(v) ? formatAdminNumber(v) : "—";
  const lines: string[] = [];
  if (facts.title) {
    lines.push(
      safeTranslate(lang, "admin_campaign_cms_confirm_fact_title", { vars: { title: facts.title } })
    );
  }
  const push =
    typeof facts.pushEligibleCount === "number"
      ? ` ${safeTranslate(lang, "admin_campaign_cms_confirm_fact_push_eligible", { vars: { count: n(facts.pushEligibleCount) } })}`
      : "";
  lines.push(
    `${safeTranslate(lang, "admin_campaign_cms_confirm_fact_audience", { vars: { count: n(facts.targetCount) } })}${push}`
  );
  lines.push(
    safeTranslate(lang, "admin_campaign_cms_confirm_fact_channel", { vars: { channel: facts.channelLabel } })
  );
  lines.push(
    safeTranslate(lang, "admin_campaign_cms_confirm_fact_time", { vars: { time: facts.timeLabel } })
  );
  return lines;
}

/** "YYYY-MM-DD HH:mm" — 관리자 표시 시간대 PHT(Asia/Manila). */
export function formatCampaignTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return formatAdminManilaDateTime(d.toISOString());
}
