/**
 * C-2 알림 상세 화면 표시 규칙 (docs/audit/notification-system-ssot-hardlock-reaudit-2026-11-01.md §10 · Owner 승인 2026-11-01).
 * 저장된 알림 값(분류·meta·외부 링크·원본 여부)만 쓴다 — 목적지·읽음 판정은 바꾸지 않는다.
 */
import type { MemberNotificationDomain } from "@/lib/notifications/member-notification-domain";

export type NotificationDetailHeaderKey =
  | "notif_detail_header_notice"
  | "notif_detail_header_system"
  | "notif_detail_header_marketing"
  | "notif_detail_header_report"
  | "notif_detail_header_generic";

export type NotificationDetailReportFacts = {
  resultKey:
    | "notif_detail_report_result_resolved"
    | "notif_detail_report_result_rejected"
    | "notif_detail_report_result_message_hide"
    | "notif_detail_report_result_room_block"
    | "notif_detail_report_result_reviewing";
  /** 조치가 있었으면 강조(그린), 위반 없음·검토 중은 보통 */
  positive: boolean;
  sourceKey:
    | "notif_detail_report_source_messenger"
    | "notif_detail_report_source_trade_chat"
    | "notif_detail_report_source_trade_report"
    | "notif_detail_report_source_chat";
};

export type NotificationDetailPrimaryCta =
  | { kind: "external" }
  | { kind: "support"; href: "/support/enter" }
  | { kind: "list" };

/**
 * 알림 최종 설계 §5 (Owner 승인 2026-11-01) — 하단 「○○ 목록」: 알림 목록이 아니라 그 분야의 목록.
 * (C-2 「알림 목록으로」 대체)
 */
export type NotificationDetailListCta = {
  href: string;
  labelKey:
    | "notif_detail_list_notice"
    | "notif_detail_list_system"
    | "notif_detail_list_marketing"
    | "notif_detail_list_reports"
    | "notif_detail_list_support"
    | "notif_detail_list_orders"
    | "notif_detail_list_trade"
    | "notif_detail_list_community"
    | "notif_detail_list_bell";
};

export type NotificationDetailPresentation = {
  headerKey: NotificationDetailHeaderKey;
  /** 운영 알림 = 「DIBAY 운영팀」, 회원 활동 = 저장된 보낸 사람 이름, 없으면 null */
  sender: { kind: "ops" } | { kind: "member"; name: string } | null;
  reportFacts: NotificationDetailReportFacts | null;
  /** 주 버튼 — 외부 링크 / 제재 안내의 고객센터. 없으면 목록 버튼이 주 버튼. */
  primaryCta: NotificationDetailPrimaryCta;
  listCta: NotificationDetailListCta;
};

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

const OPS_DOMAINS = new Set<MemberNotificationDomain>(["notice", "system", "marketing", "support"]);

function listCtaFor(
  domain: MemberNotificationDomain | null,
  meta: Record<string, unknown> | null | undefined
): NotificationDetailListCta {
  const kind = text(meta?.kind);
  if (kind === "chat_report_result" || kind === "community_report_processed" || kind === "trade_report_processed") {
    return { href: "/mypage/reports", labelKey: "notif_detail_list_reports" };
  }
  switch (domain) {
    case "notice":
      return { href: "/mypage/customer-center/notice", labelKey: "notif_detail_list_notice" };
    case "system":
      return { href: "/mypage/customer-center/system", labelKey: "notif_detail_list_system" };
    case "marketing":
      return { href: "/mypage/customer-center/marketing", labelKey: "notif_detail_list_marketing" };
    case "support":
      return { href: "/mypage/support-history", labelKey: "notif_detail_list_support" };
    case "delivery":
      return { href: "/orders", labelKey: "notif_detail_list_orders" };
    case "trade":
      return { href: "/mypage/products", labelKey: "notif_detail_list_trade" };
    case "community":
      return { href: "/philife", labelKey: "notif_detail_list_community" };
    default:
      return { href: "/notifications", labelKey: "notif_detail_list_bell" };
  }
}

function reportFacts(meta: Record<string, unknown> | null | undefined): NotificationDetailReportFacts | null {
  const kind = text(meta?.kind);
  if (kind !== "chat_report_result" && kind !== "chat_report_sanction") return null;
  const action = text(meta?.action);
  const source = text(meta?.source);
  const resultKey: NotificationDetailReportFacts["resultKey"] =
    action === "rejected"
      ? "notif_detail_report_result_rejected"
      : action === "sanction_message_hide"
        ? "notif_detail_report_result_message_hide"
        : action === "sanction_room_block"
          ? "notif_detail_report_result_room_block"
          : action === "reviewing"
            ? "notif_detail_report_result_reviewing"
            : "notif_detail_report_result_resolved";
  const sourceKey: NotificationDetailReportFacts["sourceKey"] =
    source === "messenger"
      ? "notif_detail_report_source_messenger"
      : source === "trade_chat"
        ? "notif_detail_report_source_trade_chat"
        : source === "trade_report"
          ? "notif_detail_report_source_trade_report"
          : "notif_detail_report_source_chat";
  return {
    resultKey,
    positive: action !== "rejected" && action !== "reviewing",
    sourceKey,
  };
}

function memberSenderName(meta: Record<string, unknown> | null | undefined): string {
  return (
    text(meta?.commenter_label) ||
    text(meta?.liker_label) ||
    text(meta?.actor_label) ||
    text(meta?.sender_label) ||
    ""
  );
}

export function resolveNotificationDetailPresentation(input: {
  domain: MemberNotificationDomain | null;
  meta?: Record<string, unknown> | null;
  /** 서버가 허용한 외부 링크(https)가 있는가 */
  hasExternalUrl: boolean;
  /** 원본 화면을 볼 수 없는 알림인가(목적지 판정 inbox_fallback) */
  originUnavailable: boolean;
}): NotificationDetailPresentation {
  const facts = reportFacts(input.meta);
  const domain = input.domain;

  const headerKey: NotificationDetailHeaderKey = facts
    ? "notif_detail_header_report"
    : domain === "notice"
      ? "notif_detail_header_notice"
      : domain === "system"
        ? "notif_detail_header_system"
        : domain === "marketing"
          ? "notif_detail_header_marketing"
          : "notif_detail_header_generic";

  const memberName = memberSenderName(input.meta);
  const sender: NotificationDetailPresentation["sender"] =
    facts || (domain && OPS_DOMAINS.has(domain))
      ? { kind: "ops" }
      : memberName
        ? { kind: "member", name: memberName }
        : null;

  let primaryCta: NotificationDetailPrimaryCta = { kind: "list" };
  if (input.hasExternalUrl) primaryCta = { kind: "external" };
  else if (facts && text(input.meta?.kind) === "chat_report_sanction") primaryCta = { kind: "support", href: "/support/enter" };

  return { headerKey, sender, reportFacts: facts, primaryCta, listCta: listCtaFor(domain, input.meta) };
}

/** 상세 시각 — 날짜·요일·시간 전체 (예: 2026.11.01 (일) 오전 8:34) */
export function formatNotificationDetailDateTime(iso: string, language: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const locale = language === "en" ? "en-US" : "ko-KR";
  try {
    const date = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    }).formatToParts(d);
    const get = (t: string) => date.find((p) => p.type === t)?.value ?? "";
    const time = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
    return language === "en"
      ? `${get("weekday")}, ${get("month")}/${get("day")}/${get("year")} ${time}`
      : `${get("year")}.${get("month")}.${get("day")} (${get("weekday")}) ${time}`;
  } catch {
    return d.toISOString();
  }
}
