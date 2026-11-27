import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";
import {
  OWNER_API_ERROR_MAP,
  isOwnerApiErrorCode,
  resolveOwnerApiErrorText,
  toOwnerBootstrapErrorCode,
} from "@/lib/business/owner-api-error-text";
import { localizeStoredWeekdaysSummary } from "@/lib/stores/serialize-store-business-hours-json";

const HANGUL = /[가-힣]/;
const tr = (lang: AppLanguageCode) => (key: MessageKey, vars?: Record<string, string | number>) =>
  translate(lang, key, vars);

/** 언어 재감사 2026-11-27 — 사장님 화면 오류 문구는 서버 문장을 절대 내보내지 않는다 */
describe("resolveOwnerApiErrorText", () => {
  it("코드 → 키 (표 + 기존 사장님 표)", () => {
    expect(resolveOwnerApiErrorText("load_failed", tr("ko"))).toBe(translate("ko", "business_phase7_353"));
    expect(resolveOwnerApiErrorText("content_filter_blocked", tr("en"))).toBe(
      translate("en", "content_filter_blocked_message")
    );
    for (const code of Object.keys(OWNER_API_ERROR_MAP)) {
      const en = resolveOwnerApiErrorText(code, tr("en"));
      expect(en, code).not.toMatch(HANGUL);
      expect(en, code).not.toBe(code);
      expect(resolveOwnerApiErrorText(code, tr("ko")), code).toMatch(HANGUL);
    }
  });

  it("문장·모르는 코드·빈 값 → 화면 맥락 기본 문구 (서버 문장 0)", () => {
    const korean = "운영 정책에 따라 숨김 처리된 글입니다.";
    const english = "Something exploded in the database";
    expect(resolveOwnerApiErrorText(korean, tr("en"), "store_owner_err_load_list")).toBe(
      translate("en", "store_owner_err_load_list")
    );
    expect(resolveOwnerApiErrorText(english, tr("ko"), "store_owner_err_load_list")).toBe(
      translate("ko", "store_owner_err_load_list")
    );
    expect(resolveOwnerApiErrorText("some_unknown_code", tr("en"), "owner_ads_error_generic")).toBe(
      translate("en", "owner_ads_error_generic")
    );
    expect(resolveOwnerApiErrorText(null, tr("en"))).toBe(translate("en", "common_error"));
  });

  it("RSC 로더 오류는 코드만 화면으로", () => {
    expect(toOwnerBootstrapErrorCode("session_invalid")).toBe("session_invalid");
    expect(toOwnerBootstrapErrorCode('relation "store_products" does not exist')).toBe("db_error");
    expect(toOwnerBootstrapErrorCode(undefined)).toBe("db_error");
    expect(isOwnerApiErrorCode("product_changed")).toBe(true);
    expect(isOwnerApiErrorCode("다른 곳에서 상품이 변경되었습니다.")).toBe(false);
  });
});

describe("사장님 상품·사진 API — 한국어 message 없음", () => {
  it("products-core·upload-image-core·owner-product-images 에 한국어 문자열 0", () => {
    for (const f of [
      "lib/stores/owner-catalog/products-core.server.ts",
      "lib/stores/owner-catalog/upload-image-core.server.ts",
      "lib/stores/owner-product-images.ts",
    ]) {
      const code = readFileSync(f, "utf8")
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join("\n");
      expect(code.match(/"[^"\n]*[가-힣][^"\n]*"/g), f).toBeNull();
    }
  });
});

describe("영업시간 자동 요약 — 저장은 값만, 화면은 키", () => {
  it("옛 행 「매일 …」·새 행 시각만 → 화면 언어", () => {
    expect(localizeStoredWeekdaysSummary("매일 09:00–22:00 (Asia/Manila)", tr("en"))).toBe(
      "Daily 09:00–22:00 (Asia/Manila)"
    );
    expect(localizeStoredWeekdaysSummary("09:00–22:00 (Asia/Manila)", tr("ko"))).toBe(
      "매일 09:00–22:00 (Asia/Manila)"
    );
    expect(localizeStoredWeekdaysSummary("평일 10시~ 주말 휴무", tr("en"))).toBe("평일 10시~ 주말 휴무");
  });
});
