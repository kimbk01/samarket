import { describe, expect, it, vi } from "vitest";
import { resolveProductChat } from "@/lib/trade/resolve-product-chat";

describe("거래 채팅 해석 — uuid 가 아닌 방 ID 는 조회 없이 null (G1 · 운영 uuid 오류 11-16)", () => {
  it("짧은 방 ID(8자리)는 DB 를 부르지 않는다", async () => {
    const from = vi.fn();
    expect(await resolveProductChat({ from } as never, "3e775b69")).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("uuid 는 product_chats 를 조회한다", async () => {
    const id = "3e775b69-928e-4271-ac2d-1477f15094cb";
    const row = { id, post_id: "p", seller_id: "s", buyer_id: "b", community_messenger_room_id: null };
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const from = vi.fn(() => ({ select: () => ({ eq }) }));
    const r = await resolveProductChat({ from } as never, id);
    expect(from).toHaveBeenCalledWith("product_chats");
    expect(eq).toHaveBeenCalledWith("id", id);
    expect(r?.productChatId).toBe(id);
  });
});
