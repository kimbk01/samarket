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
  it("4px 로도 안 들어가면 줄이지 않고 기본 12px — 밀어서 봄(이름 자르기 없음)", () => {
    expect(computeFitSectionTabPadPx(200, 202, 4)).toBe(12);
  });
  it("커뮤니티 주제 10개(한국어 390px 실측: 칸 282px · 글자 432px) — 기본 12px 그대로", () => {
    expect(computeFitSectionTabPadPx(282, 432, 10)).toBe(12);
  });
  it("주제가 적으면 커뮤니티도 한 줄로 맞춤", () => {
    const pad = computeFitSectionTabPadPx(282, 220, 5);
    expect(pad).toBe(6);
    expect(220 + pad * 10).toBeLessThanOrEqual(282);
  });
  it("거래·커뮤니티 2단 탭 줄이 이 규칙을 쓴다", () => {
    const src = readFileSync("components/trade/TradePrimaryTabs.tsx", "utf8");
    expect(src).toContain("useFitSectionTabPadding(tabTrackRef");
    expect(src).toContain("ref={tabTrackRef}");
    const feed = readFileSync("components/community/CommunityFeed.tsx", "utf8");
    expect(feed).toContain("useFitSectionTabPadding(topicTablistRef");
    expect(feed).toContain("ref={topicTablistRef}");
  });
});
