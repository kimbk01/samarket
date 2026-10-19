import { describe, expect, it, vi } from "vitest";

const resolveBatch = vi.fn();
vi.mock("@/lib/admin-chats/trade-messenger-room", () => ({
  emptyTradeLegacyRoomRefs: (p: Record<string, unknown>) => p,
  resolveTradeMessengerRoomIdsBatch: (...a: unknown[]) => resolveBatch(...a),
}));

/** 테이블별 결과 — `not(...)` 가 붙은 조회는 `${table}:linked` 결과. */
function fakeSb(results: Record<string, unknown[]>) {
  return {
    from(table: string) {
      let linked = false;
      const b: Record<string, unknown> = {};
      for (const op of ["select", "eq", "in", "is", "limit"]) b[op] = () => b;
      b.not = () => {
        linked = true;
        return b;
      };
      b.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: results[linked ? `${table}:linked` : table] ?? [], error: null }).then(resolve);
      return b;
    },
  };
}

const P = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-8222-222222222222";
const B1 = "33333333-3333-4333-8333-333333333333";
const B2 = "44444444-4444-4444-8444-444444444444";
const B3 = "55555555-5555-4555-8555-555555555555";

describe("loadLegacyOnlyTradeChats (설계 §3-6 단일 판정)", () => {
  it("counts listing×seller×buyer groups with no CM room and with messages", async () => {
    resolveBatch.mockResolvedValue(new Map([["pc:pc-2", "cm-2"]]));
    const { loadLegacyOnlyTradeChats } = await import("@/lib/admin-chats/legacy-only-trade-chats");
    const out = await loadLegacyOnlyTradeChats(
      fakeSb({
        product_chats: [
          // 묶음 1: product_chats + chat_rooms 둘 다 CM 없음, 메시지 있음 → 1건
          { id: "pc-1", post_id: P, seller_id: S, buyer_id: B1, last_message_at: "2026-01-01T00:00:00Z" },
          // 묶음 2: 해석기가 CM 방을 찾음 → 제외
          { id: "pc-2", post_id: P, seller_id: S, buyer_id: B2, last_message_at: "2026-01-01T00:00:00Z" },
          // 묶음 3: 메시지 없음 → 제외
          { id: "pc-3", post_id: P, seller_id: S, buyer_id: B3, last_message_at: null, last_message_preview: "" },
        ],
        chat_rooms: [{ id: "cr-1", item_id: P, seller_id: S, buyer_id: B1, last_message_at: "2026-01-01T00:00:00Z" }],
        "product_chats:linked": [],
        "chat_rooms:linked": [],
      }) as never
    );
    expect(out.count).toBe(1);
    expect(out.productChatIds).toEqual(["pc-1"]);
    expect(out.chatRoomIds).toEqual(["cr-1"]);
  });

  it("excludes a group whose twin row (other table) is linked to a CM room", async () => {
    resolveBatch.mockResolvedValue(new Map());
    const { loadLegacyOnlyTradeChats } = await import("@/lib/admin-chats/legacy-only-trade-chats");
    const out = await loadLegacyOnlyTradeChats(
      fakeSb({
        product_chats: [{ id: "pc-1", post_id: P, seller_id: S, buyer_id: B1, last_message_at: "2026-01-01T00:00:00Z" }],
        chat_rooms: [],
        "product_chats:linked": [],
        "chat_rooms:linked": [{ item_id: P, seller_id: S, buyer_id: B1 }],
      }) as never
    );
    expect(out).toEqual({ count: 0, productChatIds: [], chatRoomIds: [] });
  });
});
