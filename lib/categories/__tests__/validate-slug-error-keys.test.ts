import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import {
  CATEGORY_SLUG_ERROR_KEYS,
  categorySlugErrorKey,
  validateSlugFormat,
} from "@/lib/categories/validateSlug";

const HANGUL = /[가-힣]/;

describe("카테고리 slug 검사 — 코드만 돌려주고 화면은 키로 (언어 재감사 2026-11-27)", () => {
  it("validateSlugFormat 실패 값은 코드 모양이다", () => {
    for (const input of ["", "x".repeat(101), "Bad Slug"]) {
      const r = validateSlugFormat(input);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(CATEGORY_SLUG_ERROR_KEYS[r.error]).toBeTruthy();
      }
    }
    expect(validateSlugFormat("real-estate")).toEqual({ ok: true });
  });

  it("코드 → 키: 영어 결과에 한글 0, 한국어 결과는 한글", () => {
    for (const code of Object.keys(CATEGORY_SLUG_ERROR_KEYS)) {
      const key = categorySlugErrorKey(code);
      expect(HANGUL.test(translate("en", key))).toBe(false);
      expect(HANGUL.test(translate("ko", key))).toBe(true);
    }
  });

  it("모르는 값(DB 원문 등)은 일반 실패 키로", () => {
    expect(categorySlugErrorKey("relation \"categories\" does not exist")).toBe("category_slug_err_check_failed");
    expect(categorySlugErrorKey(null)).toBe("category_slug_err_check_failed");
  });
});
