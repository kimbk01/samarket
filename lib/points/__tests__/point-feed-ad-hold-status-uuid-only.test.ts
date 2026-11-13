import { describe, expect, it, vi } from "vitest";
import { loadFeedAdHoldStatusMap } from "@/lib/points/project-point-financial-history";

const REQ = "3f2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d";
const CAMPAIGN = "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d";

function fakeSb(rows: unknown[]) {
  const inFn = vi.fn().mockResolvedValue({ data: rows, error: null });
  const select = vi.fn(() => ({ in: inFn }));
  const from = vi.fn(() => ({ select }));
  return { sb: { from } as never, from, inFn };
}

describe("포인트 내역 — 피드 광고 보류 상태 조회는 요청 uuid 만 (운영 uuid 오류 11-08~11)", () => {
  it("환급 원장 id(feed-ad-end-refund:…)는 조회 인자에서 빠진다", async () => {
    const { sb, inFn } = fakeSb([{ request_id: REQ, status: "captured" }]);
    const map = await loadFeedAdHoldStatusMap(sb, [REQ, `feed-ad-end-refund:${CAMPAIGN}`, REQ]);
    expect(inFn).toHaveBeenCalledWith("request_id", [REQ]);
    expect(map.get(REQ)).toBe("captured");
  });

  it("환급 원장 id 만 있으면 DB 를 부르지 않는다", async () => {
    const { sb, from } = fakeSb([]);
    const map = await loadFeedAdHoldStatusMap(sb, [`feed-ad-end-refund:${CAMPAIGN}`]);
    expect(from).not.toHaveBeenCalled();
    expect(map.size).toBe(0);
  });
});
