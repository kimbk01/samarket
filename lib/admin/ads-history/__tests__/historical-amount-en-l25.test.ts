/** L25 — 광고 이력 포인트 금액: 영어 칸은 영어, 한국어 칸은 이전과 같음 */
import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 검사한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { describe, expect, it } from "vitest";
import { formatHistoricalPointAmount } from "@/lib/admin/ads-history/historical-amount";

describe("L25 광고 이력 금액 영어 칸", () => {
  it("같은 금액을 언어별로", () => {
    const ko = formatHistoricalPointAmount(1200);
    const en = formatHistoricalPointAmount(1200, false);
    expect(ko.label).toMatch(/[가-힣]/);
    expect(en.label).not.toMatch(/[가-힣]/);
    expect(en.label).toContain("1200");
    expect(en.proven).toBe(ko.proven);
  });
});
