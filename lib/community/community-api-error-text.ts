/**
 * 필라이프(동네 커뮤니티) API 오류 코드 → 화면 문구 (재감사 2026-11-27 · `lib/i18n/api-error-text.ts`).
 * 서버는 `error`·`code` 에 snake_case 코드만, 값은 `params` 로 보낸다. 서버 문장은 화면에 내보내지 않는다.
 */
import {
  resolveApiErrorText,
  type ApiErrorCodeMap,
  type ApiErrorTranslate,
} from "@/lib/i18n/api-error-text";
import type { MessageKey } from "@/lib/i18n/messages";

/** 글·댓글 내용 검사 코드 (`content-acceptance.ts`) — 글쓰기·댓글 표가 함께 쓴다 */
const CONTENT_ACCEPTANCE_KEYS = {
  content_empty: "philife_write_err_content",
  content_punctuation_only: "community_content_err_punctuation_only",
  content_repeated_only: "community_content_err_repeated_only",
  content_filter_blocked: "content_filter_blocked_message",
} as const satisfies ApiErrorCodeMap;

/** 기사·페이지 대표 사진 가져오기 (`POST /api/community/article-og-image`) */
export const COMMUNITY_OG_IMAGE_ERROR_KEYS: ApiErrorCodeMap = {
  page_url_required: "community_og_err_page_url_required",
  url_not_allowed: "community_og_err_url_not_allowed",
  page_too_large: "community_og_err_page_too_large",
  redirect_not_allowed: "community_og_err_redirect_blocked",
  page_fetch_failed: "community_og_err_page_fetch",
  page_parse_failed: "community_og_err_page_fetch",
  og_not_found: "community_og_err_image_not_found",
  image_url_invalid: "community_og_err_image_invalid",
  image_url_not_allowed: "community_og_err_image_invalid",
  upload_rate_limited: "philife_write_err_upload_rate_limited",
  network_error: "philife_write_err_network",
};

/** 동네 글 등록·수정 (`POST/PATCH /api/community/neighborhood-posts`) */
export const COMMUNITY_POST_WRITE_ERROR_KEYS: ApiErrorCodeMap = {
  ...CONTENT_ACCEPTANCE_KEYS,
  location_required: "philife_write_err_region_required",
  category_required: "community_write_err_category_required",
  title_required: "philife_write_err_title",
  content_required: "philife_write_err_content",
  title_too_long: "community_write_err_title_too_long",
  content_too_long: "community_write_err_content_too_long",
  daily_post_limit: "community_write_err_daily_limit",
  region_label_invalid: "community_write_err_location_invalid",
  location_invalid: "community_write_err_location_invalid",
  location_persist_failed: "community_write_err_location_save",
  topic_unavailable: "community_write_err_topic_unavailable",
  category_unavailable: "community_write_err_topic_unavailable",
  meetup_removed: "community_write_err_topic_unavailable",
  image_save_failed: "community_write_err_image_save",
  post_save_failed: "philife_write_err_register_failed",
  not_found: "community_err_post_not_found",
  forbidden: "common_api_forbidden",
  imported_not_editable: "community_write_err_imported_not_editable",
  moderated_not_editable: "community_write_err_moderated_not_editable",
  not_editable: "community_write_err_not_editable",
  server_config: "net_dibay_error",
};

/** 내 글 삭제 (`DELETE /api/community/neighborhood-posts/:id`) */
export const COMMUNITY_POST_DELETE_ERROR_KEYS: ApiErrorCodeMap = {
  not_found: "community_err_post_not_found",
  forbidden: "common_api_forbidden",
  imported_not_deletable: "community_delete_err_imported",
  moderated_not_deletable: "community_delete_err_moderated",
  server_config: "net_dibay_error",
};

/** 댓글 등록·수정·삭제 (`/api/community/posts/:id/comments[/:commentId]`) */
export const COMMUNITY_COMMENT_ERROR_KEYS: ApiErrorCodeMap = {
  ...CONTENT_ACCEPTANCE_KEYS,
  content_required: "philife_write_err_content",
  comment_too_long: "community_comment_err_too_long",
  comment_interval: "community_comment_err_interval",
  community_comment_rate_limited: "community_comment_err_rate_limited",
  post_not_found: "community_err_post_not_found",
  not_found: "community_err_post_not_found",
  comment_not_found: "community_err_comment_not_found",
  comment_not_deletable: "community_comment_err_not_deletable",
  community_comment_parent_not_found: "community_comment_err_parent_not_found",
  community_comment_depth_limit: "community_comment_err_depth_limit",
  community_comment_blocked_relation: "community_comment_blocked_relation",
  profile_incomplete: "community_comment_err_profile_incomplete",
};

/** 동네 피드 목록 (`GET /api/community/neighborhood-feed`) */
export const COMMUNITY_FEED_ERROR_KEYS: ApiErrorCodeMap = {
  invalid_category: "community_feed_invalid_category",
  server_config: "community_feed_server_config",
  neighbor_only_requires_login: "community_feed_neighbor_login_required",
};

export function communityApiErrorText(
  input: { json?: unknown; code?: string | null; status?: number | null },
  map: ApiErrorCodeMap,
  fallbackKey: MessageKey,
  t: ApiErrorTranslate
): string {
  return resolveApiErrorText({ ...input, map, fallbackKey, t });
}
