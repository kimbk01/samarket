import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  emptyTradeLegacyRoomRefs,
  isTradeCapableMessengerRow,
  pickTradeMessengerRoom,
  resolveTradeMessengerRoomForAdmin,
  resolveTradeMessengerRoomIdsBatch,
  tradeMessengerDirectKeys,
} from "@/lib/admin-chats/trade-messenger-room";

type Filter = { op: string; col: string; val: unknown };
type Rows = Record<string, Array<Record<string, unknown>>>;

/** Minimal read-only PostgREST fake: eq / in / limit / order / maybeSingle. Throws on writes. */
function fakeSb(tables: Rows) {
  const calls: Array<{ table: string; filters: Filter[] }> = [];
  function from(table: string) {
    const filters: Filter[] = [];
    let lim = Infinity;
    const run = () => {
      calls.push({ table, filters: [...filters] });
      return (tables[table] ?? []).filter((row) =>
        filters.every((f) =>
          f.op === "eq" ? row[f.col] === f.val : f.op === "in" ? (f.val as unknown[]).includes(row[f.col]) : true
        )
      ).slice(0, lim);
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

const CR = "11111111-1111-4111-8111-111111111111";
const PC = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";
const SELLER = "44444444-4444-4444-8444-444444444444";
const BUYER = "55555555-5555-4555-8555-555555555555";

describe("R1-B C-1 — trade legacy room → CM room (pure pick)", () => {
  const refs = emptyTradeLegacyRoomRefs({ chatRoomId: CR, productChatId: PC, itemId: ITEM, sellerId: SELLER, buyerId: BUYER });

  it("direct keys follow the user-side ensure (trade_item:{chat_rooms.id}, trade_pc:{product_chats.id})", () => {
    expect(tradeMessengerDirectKeys(refs)).toEqual([`trade_item:${CR}`, `trade_pc:${PC}`]);
  });

  it("priority: product_chats FK → chat_rooms FK → trade_item → trade_pc → domain identity", () => {
    const rows = [
      { id: "cm-identity", chat_domain: "trade", domain_identity_key: `trade:${ITEM}:${SELLER}:${BUYER}` },
      { id: "cm-pc", chat_domain: "trade", direct_key: `trade_pc:${PC}` },
      { id: "cm-item", chat_domain: "trade", direct_key: `trade_item:${CR}` },
      { id: "cm-crfk", chat_domain: "trade", direct_key: `trade_item:${CR}` },
      { id: "cm-pcfk", chat_domain: null, direct_key: `trade_pc:${PC}` },
    ];
    expect(pickTradeMessengerRoom({ ...refs, productChatFk: "cm-pcfk", chatRoomFk: "cm-crfk" }, rows)).toEqual({
      messengerRoomId: "cm-pcfk",
      source: "product_chat_fk",
    });
    expect(pickTradeMessengerRoom({ ...refs, chatRoomFk: "cm-crfk" }, rows)?.source).toBe("chat_room_fk");
    expect(pickTradeMessengerRoom(refs, rows.filter((r) => r.id !== "cm-crfk"))).toEqual({
      messengerRoomId: "cm-item",
      source: "direct_key_trade_item",
    });
    expect(pickTradeMessengerRoom(refs, rows.filter((r) => r.id === "cm-pc" || r.id === "cm-identity"))?.source).toBe(
      "direct_key_trade_pc"
    );
    expect(pickTradeMessengerRoom(refs, [rows[0]!])?.source).toBe("domain_identity");
  });

  it("never reuses a polluted FK pointing at a friend DM / group / order room", () => {
    expect(isTradeCapableMessengerRow({ id: "x", chat_domain: "general_direct" })).toBe(false);
    expect(isTradeCapableMessengerRow({ id: "x", chat_domain: "group" })).toBe(false);
    expect(isTradeCapableMessengerRow({ id: "x", chat_domain: "store_order" })).toBe(false);
    expect(isTradeCapableMessengerRow({ id: "x", chat_domain: null, direct_key: `${SELLER}:${BUYER}` })).toBe(false);
    expect(isTradeCapableMessengerRow({ id: "x", chat_domain: null, direct_key: `trade_pc:${PC}` })).toBe(true);
    const picked = pickTradeMessengerRoom({ ...refs, productChatFk: "friend" }, [
      { id: "friend", chat_domain: "general_direct", direct_key: `${SELLER}:${BUYER}` },
    ]);
    expect(picked).toBeNull();
  });
});

describe("R1-B C-1 — resolveTradeMessengerRoomForAdmin (read-only)", () => {
  it("chat_rooms id: finds product_chats by item×seller×buyer and prefers its FK", async () => {
    const { sb } = fakeSb({
      chat_rooms: [
        { id: CR, room_type: "item_trade", item_id: ITEM, seller_id: SELLER, buyer_id: BUYER, community_messenger_room_id: null },
      ],
      product_chats: [
        { id: PC, post_id: ITEM, seller_id: SELLER, buyer_id: BUYER, community_messenger_room_id: "cm-1" },
      ],
      community_messenger_rooms: [{ id: "cm-1", chat_domain: "trade", direct_key: `trade_pc:${PC}`, room_type: "direct" }],
    });
    const r = await resolveTradeMessengerRoomForAdmin(sb, CR);
    expect(r).toMatchObject({
      legacyKind: "chat_room",
      chatRoomId: CR,
      productChatId: PC,
      messengerRoomId: "cm-1",
      source: "product_chat_fk",
    });
  });

  it("product_chats id without FK: falls back to direct_key trade_item of the linked chat_rooms row", async () => {
    const { sb } = fakeSb({
      chat_rooms: [{ id: CR, room_type: "item_trade", item_id: ITEM, seller_id: SELLER, buyer_id: BUYER }],
      product_chats: [{ id: PC, post_id: ITEM, seller_id: SELLER, buyer_id: BUYER, community_messenger_room_id: null }],
      community_messenger_rooms: [{ id: "cm-2", chat_domain: "trade", direct_key: `trade_item:${CR}`, room_type: "direct" }],
    });
    const r = await resolveTradeMessengerRoomForAdmin(sb, PC);
    expect(r).toMatchObject({ legacyKind: "product_chat", chatRoomId: CR, messengerRoomId: "cm-2", source: "direct_key_trade_item" });
  });

  it("legacy-only: no CM room → messengerRoomId null (UI shows 레거시 기록)", async () => {
    const { sb } = fakeSb({
      chat_rooms: [{ id: CR, room_type: "item_trade", item_id: ITEM, seller_id: SELLER, buyer_id: BUYER }],
      product_chats: [],
      community_messenger_rooms: [],
    });
    const r = await resolveTradeMessengerRoomForAdmin(sb, CR);
    expect(r.legacyKind).toBe("chat_room");
    expect(r.messengerRoomId).toBeNull();
  });

  it("unknown id → empty resolution", async () => {
    const { sb } = fakeSb({});
    const r = await resolveTradeMessengerRoomForAdmin(sb, "nope");
    expect(r.legacyKind).toBeNull();
    expect(r.messengerRoomId).toBeNull();
  });

  it("batch resolution for list rows", async () => {
    const { sb } = fakeSb({
      community_messenger_rooms: [
        { id: "cm-a", chat_domain: "trade", direct_key: `trade_item:${CR}`, room_type: "direct" },
        { id: "cm-b", chat_domain: "trade", direct_key: `trade_pc:${PC}`, room_type: "direct" },
      ],
    });
    const map = await resolveTradeMessengerRoomIdsBatch(sb, [
      { key: CR, refs: emptyTradeLegacyRoomRefs({ chatRoomId: CR }) },
      { key: PC, refs: emptyTradeLegacyRoomRefs({ productChatId: PC }) },
      { key: "orphan", refs: emptyTradeLegacyRoomRefs({ productChatId: "orphan" }) },
    ]);
    expect(map.get(CR)).toBe("cm-a");
    expect(map.get(PC)).toBe("cm-b");
    expect(map.has("orphan")).toBe(false);
  });
});

describe("R1-B C-1 — trade admin routes act on the CM room", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("detail route overlays CM messages/participants/status; action route applies CM CAS first", () => {
    expect(read("app/api/admin/chat/rooms/[id]/route.ts")).toContain("loadAdminTradeMessengerOverlay");
    const action = read("app/api/admin/chat/rooms/[id]/action/route.ts");
    expect(action).toContain("resolveTradeMessengerRoomForAdmin");
    expect(action).toContain("runCmRoomActionCas");
    expect(action).toContain("legacy_only_read_only");
    expect(read("app/api/admin/chat/rooms/[id]/messages/bulk-hide/route.ts")).toContain("bulkSetTradeMessengerMessagesHidden");
    expect(read("app/api/admin/chat/rooms/[id]/messages/bulk-unhide/route.ts")).toContain("bulkSetTradeMessengerMessagesHidden");
  });

  it("resolver is lookup-only (no writes)", () => {
    const src = read("lib/admin-chats/trade-messenger-room.ts");
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });
});
