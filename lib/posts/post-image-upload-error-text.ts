/**
 * 거래 글 사진 올리기(`POST /api/posts/upload-image`) 오류 코드 → 화면 문구 (재감사 2026-11-27 · `lib/i18n/api-error-text.ts`).
 * 서버는 코드만 보낸다. 서버 문장을 화면에 붙이지 않는다.
 */
import {
  resolveApiErrorText,
  type ApiErrorCodeMap,
  type ApiErrorTranslate,
} from "@/lib/i18n/api-error-text";

export const POST_IMAGE_UPLOAD_ERROR_KEYS: ApiErrorCodeMap = {
  service_unavailable: "net_dibay_error",
  invalid_form: "post_image_upload_err_invalid_request",
  file_required: "post_image_upload_err_invalid_request",
  too_large: "philife_write_err_image_max_size",
  file_too_large: "philife_write_err_image_max_size",
  unsupported_type: "philife_write_err_image_type",
  upload_failed: "post_image_upload_err_failed",
  network: "common_network_error",
};

export function postImageUploadErrorText(
  input: { code?: string | null; status?: number | null; json?: unknown },
  t: ApiErrorTranslate
): string {
  return resolveApiErrorText({
    ...input,
    map: POST_IMAGE_UPLOAD_ERROR_KEYS,
    fallbackKey: "post_image_upload_err_failed",
    t,
  });
}
