import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 언어 SSOT S8-2 — Android 문자열 리소스 언어 계약.
 * - values-ko 의 키는 기본 values 에 있고, 기본값은 한글이 없다(영어) → ko·en 외 기기 언어는 영어.
 * - 기본 values 에 남은 한글 문자열(통화·알림 — S8-3·S8-4 대상)은 줄기만 한다.
 */
const read = (p: string) => readFileSync(p, "utf8");
const parse = (xml: string) =>
  Object.fromEntries([...xml.matchAll(/<string name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g)].map((m) => [m[1], m[2]]));
const HANGUL = /[가-힣]/;

const base = parse(read("android/app/src/main/res/values/strings.xml"));
const ko = parse(read("android/app/src/main/res/values-ko/strings.xml"));

/** S8-2 시점 기본 values 의 한글 문자열 수(통화 44 + 알림 1 = 45) — 줄기만 한다 */
const BASE_HANGUL_CEILING = 45;

describe("Android strings 언어 계약 (S8-2)", () => {
  it("values-ko 의 키는 기본 values 에 있고, 그 기본값은 영어(한글 없음)", () => {
    for (const key of Object.keys(ko)) {
      expect(base[key], key).toBeDefined();
      expect(HANGUL.test(base[key] ?? ""), `${key} 기본값에 한글`).toBe(false);
      expect(HANGUL.test(ko[key] ?? ""), `${key} 한국어 값`).toBe(true);
    }
  });

  it("웹 연결 오류 화면 5개는 기본 영어 + 한국어", () => {
    for (const key of [
      "dibay_webview_error_title",
      "dibay_webview_error_body",
      "dibay_webview_error_retry",
      "dibay_webview_renderer_gone_title",
      "dibay_webview_renderer_gone_body",
      // S8-2b: 화면 넘김 덮개 연결 실패 — 한국어는 이전 코드 문구 그대로
      "dibay_handoff_error",
      "dibay_handoff_error_with_reason",
    ]) {
      expect(ko[key], key).toBeDefined();
    }
  });

  it("기본 values 의 한글 문자열은 늘지 않는다 (통화·알림은 S8-3·S8-4 에서 옮김)", () => {
    const count = Object.values(base).filter((v) => HANGUL.test(v)).length;
    expect(count).toBeLessThanOrEqual(BASE_HANGUL_CEILING);
  });
});
