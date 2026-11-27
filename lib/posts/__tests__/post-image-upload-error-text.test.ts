/** 거래 글 사진 올리기 오류 코드 → 화면 문구 (재감사 2026-11-27) */
import { describe, expect, it } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";
import {
  POST_IMAGE_UPLOAD_ERROR_KEYS,
  postImageUploadErrorText,
} from "@/lib/posts/post-image-upload-error-text";

const tFor = (lang: AppLanguageCode) => (key: MessageKey, vars?: Record<string, string | number>) =>
  translate(lang, key, vars);

describe("postImageUploadErrorText", () => {
  it("모든 코드: en 한글 0", () => {
    for (const code of Object.keys(POST_IMAGE_UPLOAD_ERROR_KEYS)) {
      expect(/[가-힣]/.test(postImageUploadErrorText({ code }, tFor("en")))).toBe(false);
    }
  });

  it("서버 문장은 화면에 나가지 않는다", () => {
    const text = postImageUploadErrorText({ json: { ok: false, error: "업로드 실패" } }, tFor("en"));
    expect(text).toBe(translate("en", "post_image_upload_err_failed"));
  });

  it("응답 코드로 고른다", () => {
    expect(
      postImageUploadErrorText({ json: { ok: false, error: "too_large", code: "too_large" }, status: 413 }, tFor("ko"))
    ).toBe(translate("ko", "philife_write_err_image_max_size"));
  });
});
