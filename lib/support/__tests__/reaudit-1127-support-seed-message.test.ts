/**
 * 언어 재감사 2026-11-27 §4-3 — 고객센터 시작 메시지(옛 7행 포함)를 보는 사람 언어로.
 */
import { describe, expect, it } from "vitest";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  buildSupportOpenedSeedBody,
  buildSupportTriageSeedBody,
  resolveSupportMessageDisplayBody,
} from "@/lib/support/support-seed-message-text";

const HANGUL = /[가-힣]/;
const safeT =
  (lang: "ko" | "en") =>
  (key: MessageKey, opts?: { vars?: Record<string, string | number> }) =>
    safeTranslate(lang, key, opts);

describe("고객센터 시작 메시지", () => {
  it("저장 글자는 예전과 같다", () => {
    expect(buildSupportOpenedSeedBody()).toBe("문의를 시작했습니다.");
    expect(buildSupportTriageSeedBody("ACCOUNT", "login")).toBe("문의 접수 · ACCOUNT · login");
    expect(buildSupportTriageSeedBody("", null)).toBe("문의 접수 · SUPPORT");
  });

  it("영어 화면 한글 0", () => {
    for (const s of ["문의를 시작했습니다.", "문의 접수 · ACCOUNT · login", "문의 접수 · STORE_ORDER"]) {
      const out = resolveSupportMessageDisplayBody(safeT("en"), s);
      expect(HANGUL.test(out), out).toBe(false);
      expect(out).not.toBe(s);
    }
  });

  it("사람이 쓴 메시지는 그대로", () => {
    expect(resolveSupportMessageDisplayBody(safeT("en"), "주문이 안 와요")).toBe("주문이 안 와요");
  });
});
