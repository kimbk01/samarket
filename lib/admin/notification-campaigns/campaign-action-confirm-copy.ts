/**
 * Confirm-dialog copy for admin notification campaign mutations (client-safe).
 * Every dialog re-shows 대상 수 · 채널 · 시각 before the action runs.
 * Display text comes from the i18n catalog (`admin_campaign_cms_confirm_*`); KO/EN tables below are the fallbacks.
 */

import { safeTranslate } from "@/lib/i18n/safe-translate";

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

const KO: Record<CampaignConfirmAction, CampaignConfirmCopy> = {
  send: {
    title: "알림을 발송할까요?",
    description: "아래 대상에게 지금 발송합니다. 발송이 시작되면 내용을 수정할 수 없고 복제만 가능합니다.",
    confirmLabel: "발송",
    tone: "danger",
  },
  schedule: {
    title: "예약할까요?",
    description: "지정한 시각에 자동 발송됩니다. 발송 전까지 수정·예약 취소가 가능합니다.",
    confirmLabel: "예약",
    tone: "primary",
  },
  cancel: {
    title: "예약을 취소할까요?",
    description: "예약된 발송이 「취소됨」으로 기록되며 다시 발송되지 않습니다. 필요하면 복제해서 새로 예약하세요.",
    confirmLabel: "예약 취소",
    tone: "danger",
  },
  cancel_occurrence: {
    title: "이 회차를 취소할까요?",
    description: "선택한 회차만 「취소됨」으로 기록됩니다. 반복 알림은 다음 회차부터 계속됩니다.",
    confirmLabel: "회차 취소",
    tone: "danger",
  },
  stop_sending: {
    title: "발송을 중지할까요?",
    description: "남은 대상에게는 더 이상 발송하지 않습니다. 이미 발송된 알림은 회수되지 않습니다.",
    confirmLabel: "발송 중지",
    tone: "danger",
  },
  pause: {
    title: "반복 발송을 일시정지할까요?",
    description: "재개할 때까지 다음 회차가 발송되지 않습니다. 진행 중인 회차는 끝까지 발송됩니다.",
    confirmLabel: "일시정지",
    tone: "primary",
  },
  resume: {
    title: "반복 발송을 재개할까요?",
    description: "일시정지 중 지난 회차는 건너뛰고 다음 회차부터 발송합니다.",
    confirmLabel: "재개",
    tone: "primary",
  },
  stop_recurring: {
    title: "반복 발송을 종료할까요?",
    description: "예약된 회차가 취소되고 이후 회차도 만들어지지 않습니다. 종료 후에는 되돌릴 수 없습니다.",
    confirmLabel: "반복 중지",
    tone: "danger",
  },
  resend: {
    title: "실패한 회차를 재발송할까요?",
    description: "실패한 회차를 같은 내용으로 다시 발송합니다. 이미 받은 회원에게는 중복 발송되지 않습니다.",
    confirmLabel: "재발송",
    tone: "danger",
  },
  archive: {
    title: "보관할까요?",
    description: "보관 탭으로 이동하고 다른 목록에서는 숨겨집니다. 보관 해제로 되돌릴 수 있습니다.",
    confirmLabel: "보관",
    tone: "primary",
  },
  unarchive: {
    title: "보관을 해제할까요?",
    description: "원래 상태의 목록 탭으로 돌아갑니다.",
    confirmLabel: "보관 해제",
    tone: "primary",
  },
  duplicate: {
    title: "복제할까요?",
    description: "같은 내용으로 새 「작성 중」 알림을 만듭니다. 대상·일정은 복제본에서 다시 확인하세요.",
    confirmLabel: "복제",
    tone: "primary",
  },
  save_edit: {
    title: "변경 내용을 저장할까요?",
    description: "예약된 발송에는 저장한 내용·대상·시각이 그대로 반영됩니다.",
    confirmLabel: "저장",
    tone: "primary",
  },
};

const EN: Record<CampaignConfirmAction, CampaignConfirmCopy> = {
  send: { title: "Send this notification?", description: "Sends now to the audience below. After sending it can only be duplicated.", confirmLabel: "Send", tone: "danger" },
  schedule: { title: "Schedule?", description: "Sends automatically at the set time. You can edit or cancel until then.", confirmLabel: "Schedule", tone: "primary" },
  cancel: { title: "Cancel the reservation?", description: "Recorded as Cancelled and never sent. Duplicate it to schedule again.", confirmLabel: "Cancel reservation", tone: "danger" },
  cancel_occurrence: { title: "Cancel this occurrence?", description: "Only this occurrence is cancelled. The recurring series continues.", confirmLabel: "Cancel occurrence", tone: "danger" },
  stop_sending: { title: "Stop sending?", description: "Remaining recipients will not receive it. Delivered notifications are not recalled.", confirmLabel: "Stop sending", tone: "danger" },
  pause: { title: "Pause the recurring series?", description: "No new occurrence is sent until resumed. An in-flight occurrence finishes.", confirmLabel: "Pause", tone: "primary" },
  resume: { title: "Resume the recurring series?", description: "Occurrences missed while paused are skipped.", confirmLabel: "Resume", tone: "primary" },
  stop_recurring: { title: "End the recurring series?", description: "Queued occurrences are cancelled and no new ones are created. This cannot be undone.", confirmLabel: "Stop series", tone: "danger" },
  resend: { title: "Resend the failed occurrence?", description: "Resends with the same content. Members who already received it are not sent again.", confirmLabel: "Resend", tone: "danger" },
  archive: { title: "Archive?", description: "Moves to the Archived tab and hides it from other tabs.", confirmLabel: "Archive", tone: "primary" },
  unarchive: { title: "Unarchive?", description: "Returns to its status tab.", confirmLabel: "Unarchive", tone: "primary" },
  duplicate: { title: "Duplicate?", description: "Creates a new draft with the same content.", confirmLabel: "Duplicate", tone: "primary" },
  save_edit: { title: "Save changes?", description: "A scheduled send uses the saved content, audience and time.", confirmLabel: "Save", tone: "primary" },
};

export function campaignConfirmCopy(action: CampaignConfirmAction, lang: "ko" | "en" = "ko"): CampaignConfirmCopy {
  const ko = KO[action];
  const en = EN[action];
  return {
    title: safeTranslate(lang, `admin_campaign_cms_confirm_${action}_title`, {
      fallbackKo: ko.title,
      fallbackEn: en.title,
    }),
    description: safeTranslate(lang, `admin_campaign_cms_confirm_${action}_desc`, {
      fallbackKo: ko.description,
      fallbackEn: en.description,
    }),
    confirmLabel: safeTranslate(lang, `admin_campaign_cms_confirm_${action}_confirm`, {
      fallbackKo: ko.confirmLabel,
      fallbackEn: en.confirmLabel,
    }),
    tone: (lang === "en" ? en : ko).tone,
  };
}

/** Fact lines (대상 수 · 채널 · 시각) shown in every confirm dialog. */
export function campaignConfirmFactLines(facts: CampaignConfirmFacts, lang: "ko" | "en" = "ko"): string[] {
  const n = (v: number | null | undefined) =>
    typeof v === "number" && Number.isFinite(v) ? v.toLocaleString(lang === "en" ? "en-US" : "ko-KR") : "—";
  const lines: string[] = [];
  if (facts.title) {
    lines.push(
      safeTranslate(lang, "admin_campaign_cms_confirm_fact_title", {
        fallbackKo: `제목: ${facts.title}`,
        fallbackEn: `Title: ${facts.title}`,
        vars: { title: facts.title },
      })
    );
  }
  const push =
    typeof facts.pushEligibleCount === "number"
      ? ` ${safeTranslate(lang, "admin_campaign_cms_confirm_fact_push_eligible", {
          fallbackKo: `(푸시 수신 가능 ${n(facts.pushEligibleCount)}명)`,
          fallbackEn: `(push-eligible ${n(facts.pushEligibleCount)})`,
          vars: { count: n(facts.pushEligibleCount) },
        })}`
      : "";
  lines.push(
    `${safeTranslate(lang, "admin_campaign_cms_confirm_fact_audience", {
      fallbackKo: `대상: ${n(facts.targetCount)}명`,
      fallbackEn: `Audience: ${n(facts.targetCount)}`,
      vars: { count: n(facts.targetCount) },
    })}${push}`
  );
  lines.push(
    safeTranslate(lang, "admin_campaign_cms_confirm_fact_channel", {
      fallbackKo: `채널: ${facts.channelLabel}`,
      fallbackEn: `Channel: ${facts.channelLabel}`,
      vars: { channel: facts.channelLabel },
    })
  );
  lines.push(
    safeTranslate(lang, "admin_campaign_cms_confirm_fact_time", {
      fallbackKo: `시각: ${facts.timeLabel}`,
      fallbackEn: `Time: ${facts.timeLabel}`,
      vars: { time: facts.timeLabel },
    })
  );
  return lines;
}

/** "YYYY-MM-DD HH:mm" in Asia/Seoul (admin ops timezone). */
export function formatCampaignTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}`;
}
