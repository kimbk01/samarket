import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** 재감사 E-2 — 피드 배너 점: 누르는 영역은 버튼 자체 24px, 이웃과 겹치지 않음 */
describe("feed ad carousel dots", () => {
  const src = readFileSync(join(process.cwd(), "components/ads/FeedAdBannerCarousel.tsx"), "utf8");
  it("button is the 24px hit area with no gap and no overflowing pseudo element", () => {
    expect(src).toContain('className="flex h-6 w-6 items-center justify-center"');
    expect(src).toContain('<div className="-my-[9px] flex" role="tablist"');
    expect(src).not.toContain("before:-inset-[9px]");
  });
});
