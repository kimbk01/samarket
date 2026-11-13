/**
 * 관리자 알림 보내기 v3 — 목적지 · 유형 · 필수 항목 · 오류 문구 (클라이언트 안전, 순수 함수).
 *
 * 운영자는 4가지만 고른다: 내용 · 누르면 열 화면(목적지) · 받는 사람 · 시점.
 * 유형(공지/마케팅)은 받는 사람·목적지에서 정해진다 — 화면에서 따로 고르지 않는다.
 * 목적지 규칙은 서버 SSOT(`campaign-source-authority.ts`)와 같다.
 */

import { isCustomerCenterContentPublishedNow } from "@/lib/notices/customer-center-content";
import { translateBy } from "@/lib/i18n/translate-by";
import { catalogPair } from "@/lib/i18n/catalog-pair";
import { DIBAY_SERVICE_BRAND as B } from "@/lib/brand/dibay-service-brand";

export type CampaignCreateType = "notice" | "marketing" | "system";

/** inbox = 알림 상세 · post = 고객센터 글 · event = 이벤트 · app = 앱 화면 */
export type CampaignDestination = "inbox" | "post" | "event" | "app";

export type CampaignCreateMissingId = "title" | "body" | "post" | "event" | "app" | "selected_users" | "region" | "scheduled_at";

export type CampaignCreateMissingItem = { id: CampaignCreateMissingId; ko: string; en: string };

export type CampaignCreateFormState = {
  destination: CampaignDestination;
  title: string;
  body: string;
  postId: string;
  eventId: string;
  appPath: string;
  targetType: string;
  regionCode: string;
  selectedIds: string;
  sendMode: "immediate" | "scheduled" | "recurring";
  scheduledAt: string;
};

export function parseCampaignUserIds(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 캠페인 유형 결정 — 이벤트는 광고성(마케팅), 고객센터 글은 그 글의 게시판 유형,
 * 나머지는 받는 사람이 「광고 수신 동의 회원」이면 마케팅, 아니면 공지.
 */
export function resolveCampaignCreateType(input: {
  destination: CampaignDestination;
  targetType: string;
  postContentType?: string | null;
}): CampaignCreateType {
  if (input.destination === "event") return "marketing";
  if (input.destination === "post") {
    const ct = String(input.postContentType ?? "");
    if (ct === "notice" || ct === "system" || ct === "marketing") return ct;
    // S7 — 업데이트 소식 글 = 시스템 알림
    if (ct === "update") return "system";
  }
  return input.targetType === "marketing_opt_in" ? "marketing" : "notice";
}

/** 서버로 보낼 목적지 표시 (`target_payload.destination`). 글·이벤트는 각자 식별자로 보낸다. */
export function campaignDestinationPayload(destination: CampaignDestination): Record<string, unknown> | undefined {
  if (destination === "inbox") return { destination: "inbox_detail" };
  if (destination === "app") return { destination: "app_route" };
  return undefined;
}

function isUsableAppPath(path: string): boolean {
  const p = path.trim();
  if (!p.startsWith("/") || p.startsWith("//")) return false;
  return !(p === "/notifications" || p.startsWith("/notifications?"));
}

/** 내용·목적지 — 테스트 발송에도 필요한 항목. */
export function campaignCreateMissingForTest(s: CampaignCreateFormState): CampaignCreateMissingItem[] {
  const out: CampaignCreateMissingItem[] = [];
  if (!s.title.trim()) out.push({ id: "title", ko: "제목을 입력하세요", en: "Enter the title" });
  if (!s.body.trim()) out.push({ id: "body", ko: "메시지를 입력하세요", en: "Enter the message" });
  if (s.destination === "post" && !s.postId.trim()) {
    out.push({ id: "post", ko: "열릴 고객센터 글을 고르세요", en: "Choose the post to open" });
  }
  if (s.destination === "event" && !s.eventId.trim()) {
    out.push({ id: "event", ko: "열릴 이벤트를 고르세요", en: "Choose the event to open" });
  }
  if (s.destination === "app" && !isUsableAppPath(s.appPath)) {
    out.push({ id: "app", ko: "열릴 앱 화면을 고르세요", en: "Choose the app screen to open" });
  }
  return out;
}

/** 실발송 = 테스트 항목 + 받는 사람·예약 시각. */
export function campaignCreateMissingForSend(s: CampaignCreateFormState): CampaignCreateMissingItem[] {
  const out = campaignCreateMissingForTest(s);
  if (s.targetType === "selected_users" && parseCampaignUserIds(s.selectedIds).length === 0) {
    out.push({ id: "selected_users", ko: "받을 회원 ID를 입력하세요", en: "Enter recipient member IDs" });
  }
  if (s.targetType === "region" && !s.regionCode.trim()) {
    out.push({ id: "region", ko: "지역 코드를 입력하세요", en: "Enter the region code" });
  }
  if (s.sendMode === "scheduled" && !s.scheduledAt.trim()) {
    out.push({ id: "scheduled_at", ko: "예약 시각을 입력하세요", en: "Enter the scheduled time" });
  }
  return out;
}

/** 고객센터 글 목적지 목록 — 지금 게시 중인 글만 (비게시 글은 발송 때 거부된다). */
export function isCampaignSourcePickable(row: {
  is_active?: boolean | null;
  starts_at?: string | null;
  ends_at?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
}): boolean {
  return isCustomerCenterContentPublishedNow(row);
}

/** 앱 화면 목적지 바로 고르기 — 서버 허용 경로 검사(`resolveApprovedMarketingLandingRoute`)를 통과하는 경로. */
export const CAMPAIGN_APP_SCREEN_PRESETS: readonly { path: string; ko: string; en: string }[] = [
  { path: "/", ko: B.HOME, en: B.HOME },
  { path: "/market", ko: B.MARKET, en: B.MARKET },
  { path: "/stores", ko: B.DIPICK, en: B.DIPICK },
  { path: "/philife", ko: B.FEED, en: B.FEED },
  { path: "/mypage", ko: B.MY, en: B.MY },
];

const ERROR_COPY: Record<string, { ko: string; en: string }> = {
  notice_content_required: catalogPair("admin_choose_where_the_notification_opens"),
  system_bulletin_content_required: catalogPair("admin_system_bulletins_need_a_post"),
  marketing_source_required: catalogPair("admin_choose_where_the_notification_opens"),
  campaign_source_required: catalogPair("admin_check_where_the_notification_opens"),
  invalid_content_bind: catalogPair("admin_select_the_post_again"),
  invalid_link: catalogPair("admin_that_app_screen_path_is_not"),
  content_source_missing: catalogPair("admin_the_post_was_not_found"),
  content_source_unavailable: catalogPair("admin_the_post_is_hidden_out_of"),
  content_source_lookup_failed: catalogPair("admin_could_not_check_the_post"),
  event_source_missing: catalogPair("admin_the_event_was_not_found"),
  event_source_unpublished: catalogPair("admin_publish_the_event_first"),
  event_source_unavailable: catalogPair("admin_the_event_is_not_currently_available"),
  segment_unsupported: catalogPair("admin_this_audience_is_not_supported_yet"),
  draft_selected_users_targets_missing: catalogPair("admin_enter_recipient_member_ids"),
  user_ids_required: catalogPair("admin_no_test_recipient"),
  scheduled_at_must_be_future: catalogPair("admin_the_scheduled_time_must_be_in"),
  invalid_target_type: catalogPair("admin_invalid_audience"),
  push_only_retired: catalogPair("admin_push_only_is_retired_send_as"),
  marketing_opt_in_retired: catalogPair("admin_the_opt_in_audience_is_retired"),
  push_preview_failed: catalogPair("admin_could_not_count_push_recipients_please"),
  invalid_fields: catalogPair("admin_check_the_fields"),
  occurrence_already_exists: catalogPair("admin_already_sent_or_sending"),
  occurrence_already_sending: catalogPair("admin_already_sending"),
  occurrence_not_sendable: catalogPair("admin_not_sendable_right_now"),
  illegal_status_transition: catalogPair("admin_not_allowed_in_the_current_status"),
  campaign_archived: catalogPair("admin_archived_campaigns_cannot_be_sent"),
  admin_actor_suspended: catalogPair("admin_suspended_operators_cannot_send"),
  forbidden: catalogPair("admin_no_permission_to_send"),
  server_misconfigured: catalogPair("admin_server_configuration_error"),
  upload_failed: catalogPair("admin_image_upload_failed"),
};

/** 서버 오류 코드 → 화면 문구 (영문 원문·코드 노출 금지). 모르는 코드는 기본 문구 + 코드. */
export function campaignCreateErrorMessage(code: unknown, lang: "ko" | "en"): string {
  const c = typeof code === "string" ? code.trim() : "";
  const hit = ERROR_COPY[c];
  if (hit) return hit[lang];
  const base = translateBy(lang, "admin_request_failed", undefined, "en");
  return /^[a-z][a-z0-9_]{1,63}$/.test(c) ? `${base} (${c})` : base;
}
