/**
 * 관리자 알림 만들기 화면 — 필수 항목·오류 문구 (클라이언트 안전, 순수 함수).
 *
 * 필수 규칙은 서버 SSOT(`campaign-source-authority.ts` · `campaign-input.ts`)와 같다.
 * 화면은 이 표로 「남은 필수 항목」과 버튼 비활성 사유를 보여준다 — 규칙을 완화하지 않는다.
 * 「자동 게시」는 원본을 생략하는 것이 아니라 알림과 함께 원본 글을 만든다.
 */

import { isCustomerCenterContentPublishedNow } from "@/lib/notices/customer-center-content";

export type CampaignCreateType = "notice" | "marketing" | "system";

export type CampaignCreateMissingId =
  | "source"
  | "title"
  | "body"
  | "region"
  | "selected_users"
  | "scheduled_at";

export type CampaignCreateMissingItem = {
  id: CampaignCreateMissingId;
  /** 화면 구역 앵커 — 항목을 누르면 이 구역으로 이동한다. */
  section: "campaign-source" | "campaign-copy" | "campaign-audience";
  ko: string;
  en: string;
};

export type CampaignCreateFormState = {
  type: CampaignCreateType;
  /**
   * auto = 알림 문구로 고객센터 원본 글을 함께 게시 (발송 시 서버 원본 규칙을 그대로 만족)
   * existing = 이미 있는 고객센터 글 연결 (마케팅은 랜딩 경로도 허용)
   */
  sourceMode: "auto" | "existing";
  title: string;
  body: string;
  appNoticeId: string;
  deeplinkUrl: string;
  webUrl: string;
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

/** 마케팅 랜딩 — 서버 `resolveApprovedMarketingLandingRoute` 의 빈 값·알림센터 금지 규칙 (최종 판정은 서버). */
function hasMarketingLanding(s: CampaignCreateFormState): boolean {
  const landing = s.deeplinkUrl.trim() || s.webUrl.trim();
  if (!landing) return false;
  return !(landing === "/notifications" || landing.startsWith("/notifications?"));
}

function sourceMissing(s: CampaignCreateFormState): CampaignCreateMissingItem | null {
  if (s.sourceMode === "auto") return null;
  if (s.appNoticeId.trim()) return null;
  if (s.type === "marketing") {
    if (hasMarketingLanding(s)) return null;
    return {
      id: "source",
      section: "campaign-source",
      ko: "원본 게시글 또는 랜딩 경로를 지정하세요",
      en: "Link an original post or set a landing path",
    };
  }
  return {
    id: "source",
    section: "campaign-source",
    ko: s.type === "system" ? "연결할 시스템 안내 원본을 선택하세요" : "연결할 공지 원본을 선택하세요",
    en: s.type === "system" ? "Select the system bulletin original" : "Select the notice original",
  };
}

/** 임시 저장에도 필요한 항목 — 서버가 초안도 원본 연결을 검사한다 (RULE 11). */
export function campaignCreateMissingForDraft(s: CampaignCreateFormState): CampaignCreateMissingItem[] {
  const out: CampaignCreateMissingItem[] = [];
  const src = sourceMissing(s);
  if (src) out.push(src);
  if (!s.title.trim()) {
    out.push({ id: "title", section: "campaign-copy", ko: "알림 제목을 입력하세요", en: "Enter the title" });
  }
  if (!s.body.trim()) {
    out.push({ id: "body", section: "campaign-copy", ko: "알림 메시지를 입력하세요", en: "Enter the message" });
  }
  return out;
}

/** 발송 검토에 필요한 항목 = 초안 항목 + 대상·시점. */
export function campaignCreateMissingForSend(s: CampaignCreateFormState): CampaignCreateMissingItem[] {
  const out = campaignCreateMissingForDraft(s);
  if (s.targetType === "region" && !s.regionCode.trim()) {
    out.push({ id: "region", section: "campaign-audience", ko: "지역 코드를 입력하세요", en: "Enter the region code" });
  }
  if (s.targetType === "selected_users" && parseCampaignUserIds(s.selectedIds).length === 0) {
    out.push({
      id: "selected_users",
      section: "campaign-audience",
      ko: "받을 회원 ID를 입력하세요",
      en: "Enter recipient member IDs",
    });
  }
  if (s.sendMode === "scheduled" && !s.scheduledAt.trim()) {
    out.push({
      id: "scheduled_at",
      section: "campaign-audience",
      ko: "예약 시각을 입력하세요",
      en: "Enter the scheduled time",
    });
  }
  return out;
}

/** 원본 선택 목록 — 지금 게시 중이고 알림 유형과 같은 글만 (비게시 글은 발송 때 거부된다). */
export function isCampaignSourcePickable(
  row: {
    content_type?: string | null;
    is_active?: boolean | null;
    starts_at?: string | null;
    ends_at?: string | null;
    archived_at?: string | null;
    deleted_at?: string | null;
  },
  type: CampaignCreateType
): boolean {
  return String(row.content_type ?? "notice") === type && isCustomerCenterContentPublishedNow(row);
}

const ERROR_COPY: Record<string, { ko: string; en: string }> = {
  notice_content_required: { ko: "공지는 고객센터 공지 원본을 연결해야 발송할 수 있습니다.", en: "Notices require a linked notice original." },
  system_bulletin_content_required: {
    ko: "시스템 안내는 고객센터 시스템 안내 원본을 연결해야 발송할 수 있습니다.",
    en: "System bulletins require a linked system original.",
  },
  marketing_source_required: {
    ko: "마케팅은 원본 게시글 또는 허용된 앱 내부 랜딩 경로가 필요합니다.",
    en: "Marketing requires an original post or an approved in-app landing path.",
  },
  campaign_source_required: { ko: "원본 게시글 연결이 필요합니다.", en: "An original post link is required." },
  invalid_content_bind: {
    ko: "연결한 원본의 유형이 알림 유형과 다릅니다. 원본을 다시 선택하세요.",
    en: "The linked original does not match the notification type.",
  },
  content_source_missing: { ko: "연결한 원본 게시글을 찾을 수 없습니다.", en: "The linked original was not found." },
  content_source_unavailable: {
    ko: "연결한 원본 게시글이 숨김·기간 외·보관 상태입니다. 게시 상태를 확인하세요.",
    en: "The linked original is hidden, out of period or archived.",
  },
  content_source_lookup_failed: {
    ko: "원본 게시글 상태를 확인하지 못했습니다. 잠시 후 다시 발송하세요.",
    en: "Could not check the original post. Try again shortly.",
  },
  event_source_missing: { ko: "연결한 이벤트를 찾을 수 없습니다.", en: "The linked event was not found." },
  event_source_unpublished: { ko: "이벤트를 먼저 게시해야 발송할 수 있습니다.", en: "Publish the event first." },
  event_source_unavailable: { ko: "이벤트가 지금 노출 기간이 아닙니다.", en: "The event is not currently available." },
  segment_unsupported: { ko: "이 대상은 아직 지원되지 않습니다. 다른 대상을 선택하세요.", en: "This audience is not supported yet." },
  draft_selected_users_targets_missing: { ko: "받을 회원 ID를 입력하세요.", en: "Enter recipient member IDs." },
  user_ids_required: { ko: "테스트로 받을 회원 ID를 입력하세요.", en: "Enter test recipient IDs." },
  scheduled_at_must_be_future: { ko: "예약 시각은 지금 이후여야 합니다.", en: "The scheduled time must be in the future." },
  invalid_target_type: { ko: "대상 선택이 올바르지 않습니다.", en: "Invalid audience." },
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
