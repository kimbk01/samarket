/**
 * D-16 (광고 3차 재감사 · 2026-11-07) — 마이 배너: 고객에게 보낼 때 외부 링크(external_url) 배너는 제외한다.
 * 옛 코드는 저장만 막고 노출 단계에서 다시 거르지 않아, 예전에 저장된 외부 링크 행이 고객에게 나갔다.
 */
import { describe, expect, it } from "vitest";
import { filterMyPageBannersWithLiveDestination } from "@/lib/my/my-page-banner-destination";

describe("D-16 마이 배너 외부 링크 제외", () => {
  it("https 외부 링크 행은 빠지고 앱 안 경로는 남는다 (이벤트 조회 없음)", async () => {
    const sb = { from: () => { throw new Error("이벤트가 없으면 조회하지 않는다"); } };
    const rows = [
      { id: "in", link_url: "/mypage/points" },
      { id: "ext", link_url: "https://example.com/qa" },
      { id: "ext2", link_url: "http://example.com" },
    ];
    const out = await filterMyPageBannersWithLiveDestination(sb as never, rows);
    expect(out.map((r) => r.id)).toEqual(["in"]);
  });
});
