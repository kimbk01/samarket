import type { MessageKey } from "@/lib/i18n/messages";

/**
 * 라운지 사진 업로드·가져오기·글 저장의 오류 코드 → 화면 문구 키 (감사 docs/audit/lounge-paste-images-2026-11-20.md §11 R4).
 * 서버(`/api/community/upload-image`·`upload-image-from-url`·`neighborhood-posts`)는 코드만 돌려주고, 문구는 화면 언어로 고른다.
 * 모르는 코드는 일반 실패 문구.
 */
export function communityImageUploadErrorKey(code: unknown, status?: number): MessageKey {
  switch (typeof code === "string" ? code : "") {
    case "too_large":
      return "philife_write_err_image_too_large";
    case "unsupported_type":
    case "not_image":
      return "philife_write_err_image_type";
    case "url_not_allowed":
      return "philife_write_err_image_url_blocked";
    case "fetch_failed":
      return "philife_write_err_image_fetch";
    case "upload_rate_limited":
      return "philife_write_err_upload_rate_limited";
    case "image_not_allowed":
      return "philife_write_err_image_not_ready";
    case "too_many_images":
      return "philife_write_err_image_limit";
    default:
      return status === 413 ? "philife_write_err_image_too_large" : "philife_write_err_image_upload";
  }
}

/** 글 저장 응답의 사진 오류 코드인가 — 그 밖의 저장 오류 문구는 기존대로 */
export function isCommunityPostImageErrorCode(code: unknown): boolean {
  return code === "too_many_images" || code === "image_not_allowed";
}
