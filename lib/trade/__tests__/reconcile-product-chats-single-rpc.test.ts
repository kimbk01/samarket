/**
 * 요청 증폭 근본 수정 3단계 C-1 — item_trade → product_chats 보정 DB 함수 1회.
 * 이전: 방마다 product_chats 조회 + 같은 값 UPDATE 반복 (운영 456개 방 차이 0건인데 매번 저장).
 */
import { describe, expect, it, vi } from "vitest";
import { reconcileProductChatsFromItemTrade } from "@/lib/trade/touch-product-chat-from-item-trade-room";
import {
  runItemTradeReconcileBuyerIfStale,
  runItemTradeReconcileSellerIfStale,
} from "@/lib/trade/run-item-trade-reconcile-if-stale";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

function fakeSb(result: { data: unknown; error: unknown } = { data: { inserted: 0, updated: 0 }, error: null }) {
  const rpc = vi.fn(async () => result);
  const from = vi.fn(() => {
    throw new Error("from() must not be called — reconcile is one RPC");
  });
  return { sb: { rpc, from } as never, rpc, from };
}

describe("reconcileProductChatsFromItemTrade", () => {
  it("역할·글 id 를 DB 함수 1회로 보낸다 (테이블 직접 조회 0)", async () => {
    const { sb, rpc, from } = fakeSb({ data: { inserted: 1, updated: 2 }, error: null });
    const r = await reconcileProductChatsFromItemTrade(sb, { userId: "u1", role: "seller", postIds: [P1, P1, P2] });
    expect(r).toEqual({ inserted: 1, updated: 2 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("reconcile_product_chats_from_item_trade", {
      p_user_id: "u1",
      p_role: "seller",
      p_post_ids: [P1, P2],
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("uuid 가 아닌 글 id 는 빼고, 대상이 없으면 호출하지 않는다", async () => {
    const { sb, rpc } = fakeSb();
    expect(await reconcileProductChatsFromItemTrade(sb, { postIds: ["mock-1", ""] })).toEqual({ inserted: 0, updated: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("글 id 만 (판매자 채팅 목록): 역할 없이 해당 글의 방만", async () => {
    const { sb, rpc } = fakeSb();
    await reconcileProductChatsFromItemTrade(sb, { postIds: [P1] });
    expect(rpc).toHaveBeenCalledWith("reconcile_product_chats_from_item_trade", {
      p_user_id: null,
      p_role: null,
      p_post_ids: [P1],
    });
  });

  it("DB 오류 → null (목록 API 는 계속), 오류는 숨기지 않고 로그", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sb } = fakeSb({ data: null, error: { message: "boom" } });
    expect(await reconcileProductChatsFromItemTrade(sb, { userId: "u1", role: "buyer" })).toBeNull();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("runItemTradeReconcile*IfStale", () => {
  it("구매·판매 각 1회 호출 (이전: 글 기준 + 내 방 기준 두 번 순회)", async () => {
    const { sb, rpc } = fakeSb();
    await runItemTradeReconcileBuyerIfStale(sb, "buyer-x", [P1]);
    await runItemTradeReconcileSellerIfStale(sb, "seller-x", [P2]);
    expect(rpc).toHaveBeenCalledTimes(2);
    const calls = rpc.mock.calls as unknown as [string, Record<string, unknown>][];
    expect(calls[0]![1]).toMatchObject({ p_user_id: "buyer-x", p_role: "buyer", p_post_ids: [P1] });
    expect(calls[1]![1]).toMatchObject({ p_user_id: "seller-x", p_role: "seller", p_post_ids: [P2] });
  });

  it("실패하면 15초 건너뛰기 표시를 하지 않아 다음 요청에서 다시 시도한다", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = fakeSb({ data: null, error: { message: "boom" } });
    await runItemTradeReconcileBuyerIfStale(bad.sb, "buyer-retry", []);
    const ok = fakeSb();
    await runItemTradeReconcileBuyerIfStale(ok.sb, "buyer-retry", []);
    expect(ok.rpc).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});
