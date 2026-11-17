import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tradeHistoryChatRoomHref, tradePurchaseDetailPath } from "@/lib/mypage/trade-hub-paths";
import {
  resolveLegacyTradeChatMessengerRoomIdForViewer,
  resolveProductChatMessengerRoomIds,
} from "@/lib/trade/trade-messenger-room-link-server";
import { resolveViewerItemTradeRoom } from "@/lib/chats/resolve-viewer-item-trade-room";

type Filter = { op: string; col: string; val: unknown };
type Rows = Record<string, Array<Record<string, unknown>>>;

/** 읽기 전용 PostgREST 가짜: eq / in / order / limit / maybeSingle. 쓰기는 throw. */
function fakeSb(tables: Rows) {
  const calls: Array<{ table: string; filters: Filter[] }> = [];
  function from(table: string) {
    const filters: Filter[] = [];
    let lim = Infinity;
    const run = () => {
      calls.push({ table, filters: [...filters] });
      return (tables[table] ?? [])
        .filter((row) =>
          filters.every((f) =>
            f.op === "eq" ? row[f.col] === f.val : f.op === "in" ? (f.val as unknown[]).includes(row[f.col]) : true
          )
        )
        .slice(0, lim);
    };
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (col: string, val: unknown) => (filters.push({ op: "eq", col, val }), q),
      in: (col: string, val: unknown[]) => (filters.push({ op: "in", col, val }), q),
      order: () => q,
      limit: (n: number) => ((lim = n), q),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => resolve({ data: run(), error: null }),
      update: () => {
        throw new Error("write_not_allowed");
      },
      insert: () => {
        throw new Error("write_not_allowed");
      },
      upsert: () => {
        throw new Error("write_not_allowed");
      },
    };
    return q;
  }
  return { sb: { from } as never, calls };
}

const PC = "22222222-2222-4222-8222-222222222222";
const PC2 = "22222222-2222-4222-8222-222222222223";
const PC3 = "22222222-2222-4222-8222-222222222224";
const PC4 = "22222222-2222-4222-8222-222222222225";
const CR = "11111111-1111-4111-8111-111111111111";
const ITEM = "33333333-3333-4333-8333-333333333333";
const ITEM2 = "33333333-3333-4333-8333-333333333334";
const SELLER = "44444444-4444-4444-8444-444444444444";
const BUYER = "55555555-5555-4555-8555-555555555555";
const BUYER2 = "55555555-5555-4555-8555-555555555556";
const OTHER = "66666666-6666-4666-8666-666666666666";
const CM = "77777777-7777-4777-8777-777777777777";
const CM2 = "77777777-7777-4777-8777-777777777778";
const CM3 = "77777777-7777-4777-8777-777777777779";

describe("거래 내역 링크 — 정규 메신저 방 id 우선", () => {
  it("messengerRoomId 가 있으면 그 id 로 연다 (source 쿼리 없음)", () => {
    expect(tradeHistoryChatRoomHref({ chatId: PC, messengerRoomId: CM })).toBe(
      `/community-messenger/rooms/${CM}?cm_list=trade`
    );
    expect(tradePurchaseDetailPath("trade_shell", PC, ` ${CM} `)).toBe(
      `/community-messenger/rooms/${CM}?cm_list=trade`
    );
  });

  it("messengerRoomId 가 없을 때만 기존 product_chats.id 경로", () => {
    const legacy = `/community-messenger/rooms/${PC}?source=product_chat&cm_list=trade`;
    expect(tradeHistoryChatRoomHref({ chatId: PC })).toBe(legacy);
    expect(tradeHistoryChatRoomHref({ chatId: PC, messengerRoomId: null })).toBe(legacy);
    expect(tradeHistoryChatRoomHref({ chatId: PC, messengerRoomId: "  " })).toBe(legacy);
    expect(tradePurchaseDetailPath("trade_shell", PC)).toBe(legacy);
  });
});

describe("resolveProductChatMessengerRoomIds — 판매·구매 내역 행 배치 해석", () => {
  it("FK · 짝 chat_rooms FK · trade_pc direct_key 로 찾고, 오염 FK·미연결 행은 빼낸다", async () => {
    const { sb } = fakeSb({
      chat_rooms: [
        // PC2 의 짝 — chat_rooms 쪽에만 CM FK
        { id: CR, room_type: "item_trade", item_id: ITEM2, seller_id: SELLER, buyer_id: BUYER, community_messenger_room_id: CM2 },
      ],
      community_messenger_rooms: [
        { id: CM, chat_domain: "trade", direct_key: `trade_pc:${PC}`, room_type: "direct" },
        { id: CM2, chat_domain: "trade", direct_key: `trade_item:${CR}`, room_type: "direct" },
        { id: CM3, chat_domain: "trade", direct_key: `trade_pc:${PC3}`, room_type: "direct" },
        { id: "dm-polluted", chat_domain: "general_direct", direct_key: `${BUYER}:${SELLER}`, room_type: "direct" },
      ],
    });
    const map = await resolveProductChatMessengerRoomIds(sb, [
      { id: PC, post_id: ITEM, seller_id: SELLER, buyer_id: BUYER, community_messenger_room_id: CM },
      { id: PC2, post_id: ITEM2, seller_id: SELLER, buyer_id: BUYER, community_messenger_room_id: null },
      { id: PC3, post_id: ITEM, seller_id: SELLER, buyer_id: BUYER2, community_messenger_room_id: null },
      { id: PC4, post_id: ITEM, seller_id: SELLER, buyer_id: OTHER, community_messenger_room_id: "dm-polluted" },
    ], { userId: SELLER, role: "seller" });
    expect(map.get(PC)).toBe(CM);
    expect(map.get(PC2)).toBe(CM2);
    expect(map.get(PC3)).toBe(CM3);
    expect(map.has(PC4)).toBe(false);
  });

  it("빈 입력은 조회하지 않는다", async () => {
    const { sb, calls } = fakeSb({});
    expect((await resolveProductChatMessengerRoomIds(sb, [], { userId: BUYER, role: "buyer" })).size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("짝 chat_rooms 조회를 열람자 역할로 좁힌다 (남의 거래 행 미조회)", async () => {
    const { sb, calls } = fakeSb({
      chat_rooms: [
        { id: CR, room_type: "item_trade", item_id: ITEM2, seller_id: SELLER, buyer_id: OTHER, community_messenger_room_id: CM2 },
      ],
      community_messenger_rooms: [
        { id: CM2, chat_domain: "trade", direct_key: `trade_item:${CR}`, room_type: "direct" },
      ],
    });
    const map = await resolveProductChatMessengerRoomIds(
      sb,
      [{ id: PC2, post_id: ITEM2, seller_id: SELLER, buyer_id: BUYER, community_messenger_room_id: null }],
      { userId: BUYER, role: "buyer" }
    );
    expect(map.has(PC2)).toBe(false);
    const crCall = calls.find((c) => c.table === "chat_rooms");
    expect(crCall?.filters).toContainEqual({ op: "eq", col: "buyer_id", val: BUYER });
  });
});

describe("resolveLegacyTradeChatMessengerRoomIdForViewer — 레거시 구매 상세 리다이렉트", () => {
  const tables: Rows = {
    product_chats: [{ id: PC, post_id: ITEM, seller_id: SELLER, buyer_id: BUYER, community_messenger_room_id: CM }],
    community_messenger_rooms: [{ id: CM, chat_domain: "trade", direct_key: `trade_pc:${PC}`, room_type: "direct" }],
  };

  it("판매자·구매자면 정규 방 id", async () => {
    expect(await resolveLegacyTradeChatMessengerRoomIdForViewer(fakeSb(tables).sb, PC, BUYER)).toBe(CM);
    expect(await resolveLegacyTradeChatMessengerRoomIdForViewer(fakeSb(tables).sb, PC, SELLER)).toBe(CM);
  });

  it("비참여자·비로그인·미해석이면 null (기존 경로 유지)", async () => {
    expect(await resolveLegacyTradeChatMessengerRoomIdForViewer(fakeSb(tables).sb, PC, OTHER)).toBeNull();
    expect(await resolveLegacyTradeChatMessengerRoomIdForViewer(fakeSb(tables).sb, PC, null)).toBeNull();
    expect(await resolveLegacyTradeChatMessengerRoomIdForViewer(fakeSb({}).sb, PC, BUYER)).toBeNull();
  });
});

describe("resolveViewerItemTradeRoom — 「채팅 이어가기」 messengerRoomId", () => {
  it("FK 가 있으면 그대로 (메신저 방 추가 조회 없음)", async () => {
    const { sb, calls } = fakeSb({
      chat_rooms: [{ id: CR, room_type: "item_trade", item_id: ITEM, seller_id: SELLER, buyer_id: BUYER, community_messenger_room_id: CM }],
    });
    const r = await resolveViewerItemTradeRoom(sb, { itemId: ITEM, viewerUserId: BUYER, sellerId: SELLER });
    expect(r).toEqual({ roomId: CR, source: "chat_room", messengerRoomId: CM });
    expect(calls.some((c) => c.table === "community_messenger_rooms")).toBe(false);
  });

  it("FK 가 비면 같은 해석기로 정규 방 id 를 찾는다", async () => {
    const { sb } = fakeSb({
      product_chats: [{ id: PC, post_id: ITEM, seller_id: SELLER, buyer_id: BUYER, community_messenger_room_id: null }],
      community_messenger_rooms: [{ id: CM, chat_domain: "trade", direct_key: `trade_pc:${PC}`, room_type: "direct" }],
    });
    const r = await resolveViewerItemTradeRoom(sb, { itemId: ITEM, viewerUserId: BUYER, sellerId: SELLER });
    expect(r).toEqual({ roomId: PC, source: "product_chat", messengerRoomId: CM });
  });

  it("해석 실패면 null — 호출부가 레거시 id 로 연다", async () => {
    const { sb } = fakeSb({
      product_chats: [{ id: PC, post_id: ITEM, seller_id: SELLER, buyer_id: BUYER, community_messenger_room_id: null }],
    });
    const r = await resolveViewerItemTradeRoom(sb, { itemId: ITEM, viewerUserId: BUYER, sellerId: SELLER });
    expect(r).toEqual({ roomId: PC, source: "product_chat", messengerRoomId: null });
  });
});

describe("링크 생성처 배선", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("내역 API 가 messengerRoomId 를 내려준다", () => {
    for (const p of ["app/api/my/sales/route.ts", "app/api/my/purchases/route.ts"]) {
      const src = read(p);
      expect(src).toContain("resolveProductChatMessengerRoomIds");
      expect(src).toContain("messengerRoomId: messengerRoomIdByChatId.get(rid) ?? null");
      expect(src).toMatch(/resolveProductChatMessengerRoomIds\(sbAny, rows, \{ userId, role: "(seller|buyer)" \}\)/);
    }
    expect(read("lib/mypage/trade-history-load-server.ts").match(/community_messenger_room_id/g)?.length).toBe(2);
  });

  it("내역 카드·행 링크가 정규 id 경로를 쓴다 (product_chat 직접 링크 없음)", () => {
    for (const p of [
      "components/mypage/sales/SalesHistoryCard.tsx",
      "components/mypage/seller/SellerTradeRow.tsx",
      "components/mypage/purchases/PurchaseHistoryCard.tsx",
    ]) {
      expect(read(p)).not.toContain('tradeHubChatRoomHref(row.chatId, "product_chat")');
    }
    expect(read("components/mypage/sales/SalesHistoryCard.tsx")).toContain("tradeHistoryChatRoomHref(row)");
    expect(read("components/mypage/seller/SellerTradeRow.tsx")).toContain("tradeHistoryChatRoomHref(row)");
    expect(read("components/mypage/purchases/PurchaseHistoryCard.tsx")).toContain("row.messengerRoomId");
  });

  it("레거시 구매 상세 리다이렉트가 정규 id 해석을 거친다", () => {
    for (const p of ["app/(main)/mypage/purchases/[chatId]/page.tsx", "app/(main)/philife/purchases/[chatId]/page.tsx"]) {
      expect(read(p)).toContain("resolveLegacyPurchaseDetailRedirectHref");
    }
  });
});
