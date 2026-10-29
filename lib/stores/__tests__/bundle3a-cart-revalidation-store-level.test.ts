/**
 * 묶음3-A S-05 — 장바구니 재검증의 매장 단위 거절(`store_not_selling`)을 CTA 비활성 근거로 전달.
 * 이전: 비 2xx 를 모두 조용히 무시 → 판매 미승인 매장 주문 버튼 활성.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isStoreCartStoreLevelBlockCode,
  postStoreCartRevalidation,
} from "@/lib/stores/store-cart-revalidation-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }))
  );
}

describe("postStoreCartRevalidation — 매장 단위 거절", () => {
  it("store_not_selling(400) → onStoreLevelBlock 호출 + null", async () => {
    stubFetch(400, { ok: false, error: "store_not_selling" });
    const onStoreLevelBlock = vi.fn();
    const r = await postStoreCartRevalidation({
      storeId: "s1",
      fulfillment: "pickup",
      lines: [],
      onStoreLevelBlock,
    });
    expect(r).toBeNull();
    expect(onStoreLevelBlock).toHaveBeenCalledWith("store_not_selling");
  });
  it("다른 오류(401 등)는 콜백 없음 — 기존처럼 조용히 null", async () => {
    stubFetch(401, { ok: false, error: "unauthorized" });
    const onStoreLevelBlock = vi.fn();
    expect(
      await postStoreCartRevalidation({ storeId: "s1", fulfillment: "pickup", lines: [], onStoreLevelBlock })
    ).toBeNull();
    expect(onStoreLevelBlock).not.toHaveBeenCalled();
  });
  it("성공 응답은 줄 목록 그대로", async () => {
    stubFetch(200, { ok: true, lines: [{ line_id: "l1" }] });
    expect(await postStoreCartRevalidation({ storeId: "s1", fulfillment: "pickup", lines: [] })).toEqual([
      { line_id: "l1" },
    ]);
  });
  it("코드 판정", () => {
    expect(isStoreCartStoreLevelBlockCode("store_not_selling")).toBe(true);
    expect(isStoreCartStoreLevelBlockCode("store_closed")).toBe(false);
    expect(isStoreCartStoreLevelBlockCode(undefined)).toBe(false);
  });
});
