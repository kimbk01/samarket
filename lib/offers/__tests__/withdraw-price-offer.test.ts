/** M4 — 보낸 가격 제안 철회: DB 함수 결과를 HTTP 상태로 매핑 */
import { describe, expect, it } from "vitest";
import { withdrawPriceOffer } from "@/lib/offers/price-offers.server";

function sbWith(rpcResult: { data: unknown; error: unknown }) {
  const calls: Array<[string, unknown]> = [];
  const sb = {
    rpc: async (fn: string, args: unknown) => {
      calls.push([fn, args]);
      return rpcResult;
    },
  } as never;
  return { sb, calls };
}

describe("withdrawPriceOffer", () => {
  it("구매자 id 와 제안 id 로 withdraw_price_offer 호출", async () => {
    const { sb, calls } = sbWith({ data: "forbidden", error: null });
    await withdrawPriceOffer(sb, { actorUserId: "u1", offerId: "o1" });
    expect(calls).toEqual([["withdraw_price_offer", { p_offer_id: "o1", p_buyer_id: "u1" }]]);
  });

  it.each([
    ["not_found", 404],
    ["forbidden", 403],
    ["invalid_state", 409],
  ])("%s → %i", async (outcome, status) => {
    const { sb } = sbWith({ data: outcome, error: null });
    const r = await withdrawPriceOffer(sb, { actorUserId: "u1", offerId: "o1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.status).toBe(status);
  });

  it("DB 오류는 500", async () => {
    const { sb } = sbWith({ data: null, error: { message: "x" } });
    const r = await withdrawPriceOffer(sb, { actorUserId: "u1", offerId: "o1" });
    expect(!r.ok && r.error.status).toBe(500);
  });

  it("입력 누락은 400 (DB 호출 없음)", async () => {
    const { sb, calls } = sbWith({ data: "withdrawn", error: null });
    const r = await withdrawPriceOffer(sb, { actorUserId: "", offerId: "o1" });
    expect(!r.ok && r.error.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
