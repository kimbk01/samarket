import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeFitSectionTabPadPx } from "@/lib/ui/use-fit-section-tab-padding";

/** 거래 2단 「Categories」 잘림 수정 (Owner 2026-11-12) — 실측 값: 390px 영문 탭 칸 267px · 글자 합 202px · 탭 4개 */
describe("computeFitSectionTabPadPx", () => {
  it("칸이 넉넉하면 기본 12px", () => {
    expect(computeFitSectionTabPadPx(400, 202, 4)).toBe(12);
  });
  it("390px 영문 — 여백을 줄여 4개가 한 줄에 다 들어감", () => {
    const pad = computeFitSectionTabPadPx(267, 202, 4);
    expect(pad).toBe(8);
    expect(202 + pad * 8).toBeLessThanOrEqual(267);
  });
  it("360px 영문(칸 237px) — 최소 4px 로 들어감", () => {
    const pad = computeFitSectionTabPadPx(237, 202, 4);
    expect(pad).toBe(4);
    expect(202 + pad * 8).toBeLessThanOrEqual(237);
  });
  it("더 좁으면 4px 아래로 줄이지 않음(밀어서 봄, 이름 자르기 없음)", () => {
    expect(computeFitSectionTabPadPx(200, 202, 4)).toBe(4);
  });
  it("거래 2단 탭 줄이 이 규칙을 쓴다", () => {
    const src = readFileSync("components/trade/TradePrimaryTabs.tsx", "utf8");
    expect(src).toContain("useFitSectionTabPadding(tabTrackRef");
    expect(src).toContain("ref={tabTrackRef}");
  });
});
