import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { OWNER_POST_API_ERROR_MAP, resolveOwnerPostApiErrorText } from "@/lib/posts/owner-post-api-error-text";

const HANGUL = /[가-힣]/;
const tr = (lang: AppLanguageCode) => (key: MessageKey, vars?: Record<string, string | number>) =>
  translate(lang, key, vars);

const ROUTES = [
  "app/api/posts/[postId]/owner-delete/route.ts",
  "app/api/posts/[postId]/owner-edit/route.ts",
  "app/api/posts/[postId]/owner-status/route.ts",
  "app/api/posts/[postId]/owner-trade-update/route.ts",
  "lib/posts/owner-edit-select-post-row.ts",
];

/** 언어 재감사 2026-11-27 — 판매자 본인 글 API 는 코드만, 화면은 키 */
describe("owner post API 오류", () => {
  it("서버 파일에 한국어 응답 문자열 0", () => {
    for (const f of ROUTES) {
      const code = readFileSync(f, "utf8")
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join("\n");
      expect(code.match(/["`][^"`\n]*[가-힣][^"`\n]*["`]/g), f).toBeNull();
    }
  });

  it("코드 → 키: 영어에 한글 0 · 한국어 카탈로그", () => {
    for (const code of Object.keys(OWNER_POST_API_ERROR_MAP)) {
      const en = resolveOwnerPostApiErrorText({ code, fallbackKey: "common_error", t: tr("en") });
      expect(en, code).not.toMatch(HANGUL);
      expect(en, code).not.toContain(code);
      expect(resolveOwnerPostApiErrorText({ code, fallbackKey: "common_error", t: tr("ko") }), code).toMatch(HANGUL);
    }
  });

  it("옛 서버 문장은 화면에 나오지 않는다", () => {
    const text = resolveOwnerPostApiErrorText({
      json: { ok: false, error: "본인 글만 삭제할 수 있습니다." },
      status: 400,
      fallbackKey: "trade_detail_delete_failed",
      t: tr("en"),
    });
    expect(text).toBe(translate("en", "trade_detail_delete_failed"));
  });
});
