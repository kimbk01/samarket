import { describe, expect, it } from "vitest";
import { resolvePinnedChromeOffsetPx } from "@/lib/ui/use-pin-chrome-to-visual-viewport-top";

describe("resolvePinnedChromeOffsetPx", () => {
  it("iOS visualViewport pan — 헤더를 보이는 영역 상단으로 내림", () => {
    expect(resolvePinnedChromeOffsetPx({ naturalTopPx: 0, visualViewportOffsetTopPx: 280 })).toBe(280);
  });
  it("문서 스크롤로 헤더가 위로 밀린 경우", () => {
    expect(resolvePinnedChromeOffsetPx({ naturalTopPx: -120, visualViewportOffsetTopPx: 0 })).toBe(120);
  });
  it("밀림 없음(Android·키보드 닫힘) — 이동 0", () => {
    expect(resolvePinnedChromeOffsetPx({ naturalTopPx: 0, visualViewportOffsetTopPx: 0 })).toBe(0);
    expect(resolvePinnedChromeOffsetPx({ naturalTopPx: 40, visualViewportOffsetTopPx: 0 })).toBe(0);
  });
});
