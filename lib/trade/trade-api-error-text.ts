/**
 * 거래 도메인 API 오류 코드 → 화면 문구 (언어 재감사 2026-11-27 · `lib/i18n/api-error-text.ts`).
 * 거래 채팅 전송·채팅 시작·판매 단계·글쓰기·수정·댓글·일자리 지원·거래 문제 접수·지역 일괄 변경 API 는
 * `{ ok:false, error:<code>, code:<code>, params? }` 만 보낸다. 화면은 이 표로만 그린다(서버 문장 노출 0).
 *
 * 저장 토큰(옛 행·새 행 공통) → 화면 문구 대응도 여기 둔다 — DB 는 고치지 않는다.
 */
import {
  resolveApiErrorText,
  type ApiErrorCodeMap,
  type ApiErrorTranslate,
} from "@/lib/i18n/api-error-text";
import type { MessageKey } from "@/lib/i18n/messages";
import { OWNER_POST_API_ERROR_MAP } from "@/lib/posts/owner-post-api-error-text";
import { SELLER_LISTING_LABEL } from "@/lib/products/seller-listing-state";

/** 거래 화면 공통 — 로그인·서버·제한 */
const TRADE_COMMON_ERROR_KEYS = {
  login_required: "common_login_required",
  network_error: "nav_trade_network_error",
  invalid_request: "reaudit_trade_err_invalid_request",
  invalid_json: "reaudit_trade_err_invalid_request",
  service_unavailable: "net_dibay_error",
  supabase_unconfigured: "net_dibay_error",
  trade_restricted: "reaudit_trade_restricted",
  trade_restricted_until: "reaudit_trade_restricted_until",
  content_filter_blocked: "content_filter_blocked_message",
  too_many_requests: "common_api_too_many_requests",
  rate_limited: "common_api_too_many_requests",
  profile_incomplete: "api_err_profile_incomplete",
  product_not_found: "common_product_not_found",
} as const satisfies ApiErrorCodeMap;

/** 거래 채팅 전송 (`/api/chat/room/[roomId]/send` · `/api/chat/rooms/[roomId]/messages`) */
export const TRADE_CHAT_SEND_ERROR_KEYS: ApiErrorCodeMap = {
  ...TRADE_COMMON_ERROR_KEYS,
  message_required: "reaudit_trade_chat_err_message_required",
  image_required: "reaudit_trade_chat_err_image_required",
  chat_room_not_found: "common_chat_room_not_found",
  not_participant: "reaudit_trade_chat_err_not_participant",
  chat_room_left: "reaudit_trade_chat_err_room_left",
  seller_left_chat: "reaudit_trade_chat_err_seller_left",
  admin_chat_suspended: "reaudit_trade_chat_admin_suspended",
  chat_limited_mode: "reaudit_trade_chat_err_limited",
  chat_readonly: "reaudit_trade_chat_err_readonly",
  peer_blocked: "reaudit_trade_chat_err_blocked",
  store_order_chat_moved: "reaudit_trade_chat_err_order_chat_moved",
  chat_type_removed: "reaudit_trade_chat_err_type_removed",
  chat_request_pending: "reaudit_trade_chat_err_pending",
  item_reserved_other_buyer: "reaudit_trade_chat_err_reserved_other",
  send_failed: "reaudit_trade_chat_err_send_failed",
  trade_chat_participant_lookup_failed: "reaudit_trade_chat_err_send_failed",
  trade_chat_message_insert_failed: "reaudit_trade_chat_err_send_failed",
  trade_chat_message_rate_limited: "reaudit_trade_chat_err_rate_limited",
};

/** 거래 채팅 시작 (`/api/trade/chat/entry/resolve` · item start core · 레거시 product_chats) */
export const TRADE_CHAT_ENTRY_ERROR_KEYS: ApiErrorCodeMap = {
  ...TRADE_COMMON_ERROR_KEYS,
  product_invalid: "reaudit_trade_entry_err_product_invalid",
  own_product_chat: "reaudit_trade_entry_err_own_product",
  product_deleted: "reaudit_trade_entry_err_deleted",
  product_hidden: "reaudit_trade_entry_err_hidden",
  product_unavailable: "reaudit_trade_entry_err_unavailable",
  product_sold: "reaudit_trade_entry_err_sold",
  blocked_relation: "reaudit_trade_entry_err_blocked",
  trade_chat_restricted: "reaudit_trade_entry_err_chat_restricted",
  item_reserved_other_buyer: "reaudit_trade_chat_err_reserved_other",
  chat_room_create_failed: "chats_compose_create_failed",
  participant_insert_failed: "chats_compose_create_failed",
};

/** 판매 단계 변경 (`/api/posts/[postId]/seller-listing-state`) + 거래 진행 버튼(`TradeFlowBanner`) */
export const TRADE_LISTING_ERROR_KEYS: ApiErrorCodeMap = {
  ...TRADE_COMMON_ERROR_KEYS,
  post_lookup_failed: "net_dibay_error",
  seller_only: "reaudit_trade_listing_err_seller_only",
  reserved_not_supported: "reaudit_trade_listing_err_reserved_not_supported",
  completed_requires_seller_complete: "reaudit_trade_listing_err_complete_via_chat",
  listing_transition_not_allowed: "reaudit_trade_listing_err_transition",
  reserved_buyer_required: "reaudit_trade_listing_err_buyer_required",
  reserved_buyer_no_chat: "reaudit_trade_listing_err_buyer_no_chat",
  seller_listing_schema_missing: "chats_listing_save_schema_error",
  seller_listing_save_failed: "common_save_failed",
  chat_room_not_found: "common_chat_room_not_found",
  buyer_only: "reaudit_trade_buyer_issue_err_buyer_only",
};

/** 판매 단계 저장 성공 경고 코드 → 문구 */
export const TRADE_LISTING_WARNING_KEYS: Readonly<Record<string, MessageKey>> = {
  reserved_buyer_column_missing: "reaudit_trade_listing_warn_reserved_buyer",
  seller_listing_column_missing: "reaudit_trade_listing_warn_stage_partial",
};

/** 거래 글쓰기·수정 (`/api/posts/create` · `owner-trade-update`) */
export const TRADE_WRITE_ERROR_KEYS: ApiErrorCodeMap = {
  ...OWNER_POST_API_ERROR_MAP,
  ...TRADE_COMMON_ERROR_KEYS,
  /** 가입 진행 중 거절 — 「가입 이어하기」 창과 같은 문구 (F2 2026-11-27) */
  signup_incomplete: "auth_reg_gate_title",
  invalid_post_type: "reaudit_trade_write_err_invalid_type",
  category_required: "reaudit_trade_write_err_category_required",
  title_required: "ui_product_err_title",
  content_required: "ui_write_err_content",
  region_label_invalid: "reaudit_trade_write_err_region_invalid",
  post_save_failed: "common_save_failed",
  trade_core_locked: "reaudit_trade_edit_err_core_locked",
  trade_content_append_only: "reaudit_trade_edit_err_append_only",
  /** 서버 필수 칸 검사(`server-required-fields.server.ts`, 2단계에서만 켜짐) — 사후 검토 M6 2026-11-27 */
  required_field_missing: "trade_write_err_required_fields",
};

/**
 * 글 댓글 (`/api/posts/[postId]/comments`) — 코드는 커뮤니티 댓글 표(`COMMUNITY_COMMENT_ERROR_KEYS`)와 같은 이름을 쓴다
 * (화면 `PostCommunityCommentsSection` 이 그 표를 씀).
 */
export const POST_COMMENT_ERROR_KEYS: ApiErrorCodeMap = {
  ...TRADE_COMMON_ERROR_KEYS,
  content_required: "reaudit_trade_comment_err_content_required",
  community_comment_parent_not_found: "reaudit_trade_comment_err_parent_not_found",
  community_comment_depth_limit: "reaudit_trade_comment_err_reply_depth",
  comment_save_failed: "reaudit_trade_comment_err_save_failed",
};

/** 일자리 지원 (`/api/posts/[postId]/job-apply`) */
export const JOB_APPLY_ERROR_KEYS: ApiErrorCodeMap = {
  ...TRADE_COMMON_ERROR_KEYS,
  post_not_found: "community_err_post_not_found",
  own_post_apply: "reaudit_trade_job_err_own_post",
  not_job_post: "reaudit_trade_job_err_not_job",
  not_hiring_post: "reaudit_trade_job_err_not_hiring",
  job_not_open: "reaudit_trade_job_err_not_open",
  duplicate_application: "reaudit_trade_job_err_duplicate",
  job_apply_failed: "trade_detail_job_apply_failed",
};

/** 지역 일괄 변경 (`/api/me/posts/bulk-region`) */
export const BULK_REGION_ERROR_KEYS: ApiErrorCodeMap = {
  ...TRADE_COMMON_ERROR_KEYS,
  /** 화면 `BulkRegionChangeContent` 표와 같은 코드 */
  location_required: "settings_bulk_region_location_required",
};

export type TradeApiErrorInput = {
  json?: unknown;
  code?: string | null;
  status?: number | null;
};

export function tradeChatSendErrorText(input: TradeApiErrorInput, t: ApiErrorTranslate): string {
  return resolveApiErrorText({ ...input, map: TRADE_CHAT_SEND_ERROR_KEYS, fallbackKey: "nav_trade_cannot_send_message", t });
}

export function tradeChatEntryErrorText(input: TradeApiErrorInput, t: ApiErrorTranslate): string {
  return resolveApiErrorText({ ...input, map: TRADE_CHAT_ENTRY_ERROR_KEYS, fallbackKey: "chats_compose_create_failed", t });
}

export function tradeListingErrorText(
  input: TradeApiErrorInput,
  t: ApiErrorTranslate,
  fallbackKey: MessageKey = "common_save_failed"
): string {
  return resolveApiErrorText({ ...input, map: TRADE_LISTING_ERROR_KEYS, fallbackKey, t });
}

export function tradeListingWarningText(code: string | null | undefined, t: ApiErrorTranslate): string | null {
  const key = typeof code === "string" ? TRADE_LISTING_WARNING_KEYS[code.trim()] : undefined;
  return key ? t(key) : null;
}

export function tradeWriteErrorText(input: TradeApiErrorInput, t: ApiErrorTranslate): string {
  return resolveApiErrorText({ ...input, map: TRADE_WRITE_ERROR_KEYS, fallbackKey: "common_save_failed", t });
}

export function postCommentErrorText(input: TradeApiErrorInput, t: ApiErrorTranslate): string {
  return resolveApiErrorText({ ...input, map: POST_COMMENT_ERROR_KEYS, fallbackKey: "reaudit_trade_comment_err_save_failed", t });
}

export function jobApplyErrorText(input: TradeApiErrorInput, t: ApiErrorTranslate): string {
  return resolveApiErrorText({ ...input, map: JOB_APPLY_ERROR_KEYS, fallbackKey: "trade_detail_job_apply_failed", t });
}

export function bulkRegionErrorText(input: TradeApiErrorInput, t: ApiErrorTranslate): string {
  return resolveApiErrorText({ ...input, map: BULK_REGION_ERROR_KEYS, fallbackKey: "common_save_failed", t });
}

/**
 * 거래 채팅 저장 미리보기·본문 토큰(`product_chats.last_message_preview` · `chat_messages.body` ·
 * `chat_rooms.last_message_preview`) → 화면 문구. 서버는 언어와 무관한 고정 토큰을 저장하고(옛 행과 같은 값 —
 * 다른 화면·알림이 이 값을 읽으므로 형식은 바꾸지 않는다), 화면이 이 함수로 보는 사람 언어로 그린다.
 * 대응표에 없는 글(회원이 쓴 메시지)은 그대로.
 *
 * 사후 검토 R1 (2026-11-27): 토큰은 카탈로그와 분리한 고정 글자다 — 누가 화면 문구(카탈로그)를 고쳐도 저장 글자는
 * 바뀌지 않아 옛 행이 계속 맞는다. 값은 옛 행과 같은 한국어 글자 그대로(`*Ko`). 화면에 그대로 쓰지 않는다.
 */
const TRADE_STORED_TOKEN = {
  photoKo: "사진",
  photoCountKo: "사진 {count}장",
  statusNoticeKo: "거래 상태 안내",
  systemKo: "(시스템)",
  messageKo: "(메시지)",
  listingHiddenKo: "숨김",
  listingDeletedKo: "삭제됨",
} as const;

export const TRADE_CHAT_PREVIEW_TOKEN_PHOTO: string = TRADE_STORED_TOKEN.photoKo;
export const TRADE_CHAT_PREVIEW_TOKEN_STATUS_NOTICE: string = TRADE_STORED_TOKEN.statusNoticeKo;
export const TRADE_CHAT_PREVIEW_TOKEN_SYSTEM: string = TRADE_STORED_TOKEN.systemKo;
export const TRADE_CHAT_PREVIEW_TOKEN_MESSAGE: string = TRADE_STORED_TOKEN.messageKo;
const PHOTO_COUNT_TEMPLATE: string = TRADE_STORED_TOKEN.photoCountKo;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PHOTO_COUNT_TOKEN = new RegExp(
  `^${PHOTO_COUNT_TEMPLATE.split("{count}").map(escapeRegExp).join("(\\d+)")}$`
);

/** 저장용 사진 미리보기 토큰 (언어 무관 고정값 — 화면은 `tradeChatStoredPreviewText`) */
export function tradeChatPhotoPreviewToken(count: number): string {
  return count > 1 ? PHOTO_COUNT_TEMPLATE.replace("{count}", String(count)) : TRADE_CHAT_PREVIEW_TOKEN_PHOTO;
}

export function tradeChatStoredPreviewText(stored: string | null | undefined, t: ApiErrorTranslate): string {
  const raw = typeof stored === "string" ? stored : "";
  const s = raw.trim();
  if (s === TRADE_CHAT_PREVIEW_TOKEN_PHOTO) return t("cm_home_preview_photo");
  const m = PHOTO_COUNT_TOKEN.exec(s);
  if (m) return t("cm_ui_photo_count_sheets", { count: Number(m[1]) });
  if (s === TRADE_CHAT_PREVIEW_TOKEN_STATUS_NOTICE) return t("reaudit_trade_chat_preview_status_notice");
  if (s === TRADE_CHAT_PREVIEW_TOKEN_SYSTEM) return t("reaudit_trade_chat_preview_system");
  if (s === TRADE_CHAT_PREVIEW_TOKEN_MESSAGE) return t("reaudit_trade_chat_preview_message");
  return raw;
}

/**
 * 채팅방 글 상태 저장 토큰(`summary.itemStateLabel` 등 — `SELLER_LISTING_LABEL`·숨김·삭제됨 한국어 값, 옛·새 행 공통)
 * → 화면 문구 키. 토큰은 다른 파일 판정(볼 수 없는 글 등)이 읽으므로 저장 형식은 그대로 둔다.
 */
const STORED_LISTING_LABEL_KEYS: ReadonlyMap<string, MessageKey> = new Map<string, MessageKey>([
  [SELLER_LISTING_LABEL.inquiry, "trade_listing_step_inquiry"],
  [SELLER_LISTING_LABEL.negotiating, "trade_listing_step_negotiating"],
  [SELLER_LISTING_LABEL.reserved, "trade_listing_step_reserved"],
  [SELLER_LISTING_LABEL.completed, "mypage_comp_listing_completed"],
  [TRADE_STORED_TOKEN.listingHiddenKo, "mypage_comp_product_status_hidden"],
  [TRADE_STORED_TOKEN.listingDeletedKo, "mypage_comp_product_status_deleted"],
]);

export function tradeStoredListingLabelKey(stored: string | null | undefined): MessageKey | null {
  const s = typeof stored === "string" ? stored.trim() : "";
  return STORED_LISTING_LABEL_KEYS.get(s) ?? null;
}

export function tradeStoredListingLabelText(stored: string | null | undefined, t: ApiErrorTranslate): string {
  const key = tradeStoredListingLabelKey(stored);
  return key ? t(key) : typeof stored === "string" ? stored : "";
}
