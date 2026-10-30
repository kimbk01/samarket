/**
 * 관리자 알림 보내기 v3 — 목적지 · 유형 · 필수 항목 · 오류 문구 (클라이언트 안전, 순수 함수).
 *
 * 운영자는 4가지만 고른다: 내용 · 누르면 열 화면(목적지) · 받는 사람 · 시점.
 * 유형(공지/마케팅)은 받는 사람·목적지에서 정해진다 — 화면에서 따로 고르지 않는다.
 * 목적지 규칙은 서버 SSOT(`campaign-source-authority.ts`)와 같다.
 */

import { isCustomerCenterContentPublishedNow } from "@/lib/notices/customer-center-content";

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
  { path: "/", ko: "홈", en: "Home" },
  { path: "/market", ko: "중고거래", en: "Market" },
  { path: "/stores", ko: "배달·매장", en: "Stores" },
  { path: "/philife", ko: "Philife", en: "Philife" },
  { path: "/mypage", ko: "마이페이지", en: "My page" },
];

const ERROR_COPY: Record<string, { ko: string; en: string }> = {
  notice_content_required: { ko: "열릴 화면(목적지)을 고르세요.", en: "Choose where the notification opens." },
  system_bulletin_content_required: { ko: "시스템 안내는 고객센터 글을 골라야 합니다.", en: "System bulletins need a post." },
  marketing_source_required: { ko: "열릴 화면(목적지)을 고르세요.", en: "Choose where the notification opens." },
  campaign_source_required: { ko: "열릴 화면(목적지)을 확인하세요.", en: "Check where the notification opens." },
  invalid_content_bind: { ko: "고른 글을 다시 선택하세요.", en: "Select the post again." },
  invalid_link: { ko: "열 수 없는 앱 화면 경로입니다.", en: "That app screen path is not allowed." },
  content_source_missing: { ko: "고른 고객센터 글을 찾을 수 없습니다.", en: "The post was not found." },
  content_source_unavailable: {
    ko: "고른 고객센터 글이 숨김·기간 외·보관 상태입니다. 게시 상태를 확인하세요.",
    en: "The post is hidden, out of period or archived.",
  },
  content_source_lookup_failed: { ko: "글 상태를 확인하지 못했습니다. 잠시 후 다시 발송하세요.", en: "Could not check the post." },
  event_source_missing: { ko: "고른 이벤트를 찾을 수 없습니다.", en: "The event was not found." },
  event_source_unpublished: { ko: "이벤트를 먼저 게시해야 발송할 수 있습니다.", en: "Publish the event first." },
  event_source_unavailable: { ko: "이벤트가 지금 노출 기간이 아닙니다.", en: "The event is not currently available." },
  segment_unsupported: { ko: "이 대상은 아직 지원되지 않습니다.", en: "This audience is not supported yet." },
  draft_selected_users_targets_missing: { ko: "받을 회원 ID를 입력하세요.", en: "Enter recipient member IDs." },
  user_ids_required: { ko: "테스트로 받을 계정이 없습니다.", en: "No test recipient." },
  scheduled_at_must_be_future: { ko: "예약 시각은 지금 이후여야 합니다.", en: "The scheduled time must be in the future." },
  invalid_target_type: { ko: "받는 사람 선택이 올바르지 않습니다.", en: "Invalid audience." },
  invalid_fields: { ko: "입력값을 확인하세요.", en: "Check the fields." },
  occurrence_already_exists: { ko: "이미 발송했거나 발송 중인 알림입니다.", en: "Already sent or sending." },
  occurrence_already_sending: { ko: "이미 발송 중입니다.", en: "Already sending." },
  occurrence_not_sendable: { ko: "지금 발송할 수 없는 상태입니다.", en: "Not sendable right now." },
  illegal_status_transition: { ko: "현재 상태에서는 이 동작을 할 수 없습니다.", en: "Not allowed in the current status." },
  campaign_archived: { ko: "보관된 알림은 발송할 수 없습니다.", en: "Archived campaigns cannot be sent." },
  admin_actor_suspended: { ko: "정지된 운영자 계정은 발송할 수 없습니다.", en: "Suspended operators cannot send." },
  forbidden: { ko: "발송 권한이 없습니다.", en: "No permission to send." },
  server_misconfigured: { ko: "서버 설정 오류로 처리하지 못했습니다.", en: "Server configuration error." },
  upload_failed: { ko: "이미지를 올리지 못했습니다. JPG·PNG·WEBP 파일인지 확인하세요.", en: "Image upload failed." },
};

/** 서버 오류 코드 → 화면 문구 (영문 원문·코드 노출 금지). 모르는 코드는 기본 문구 + 코드. */
export function campaignCreateErrorMessage(code: unknown, lang: "ko" | "en"): string {
  const c = typeof code === "string" ? code.trim() : "";
  const hit = ERROR_COPY[c];
  if (hit) return hit[lang];
  const base = lang === "ko" ? "처리하지 못했습니다." : "Request failed.";
  return /^[a-z][a-z0-9_]{1,63}$/.test(c) ? `${base} (${c})` : base;
}
