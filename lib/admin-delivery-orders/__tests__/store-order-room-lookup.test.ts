import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  lookupStoreOrderMessengerRoomReadOnly,
  lookupStoreOrderMessengerRoomsBatchReadOnly,
  storeOrderRoomDirectKeys,
} from "@/lib/admin-delivery-orders/store-order-room-lookup";
import { mapAdminStoreOrderChatMessages } from "@/lib/admin-delivery-orders/load-admin-store-order-chat";
import { ADMIN_STORE_ORDER_CHAT_LIST_LIMIT } from "@/lib/admin-delivery-orders/admin-order-chat-limits";

type Rows = Record<string, Array<Record<string, unknown>>>;

function fakeSb(tables: Rows) {
  const writes: string[] = [];
  function from(table: string) {
    const filters: Array<{ op: string; col: string; val: unknown }> = [];
    let lim = Infinity;
    const run = () =>
      (tables[table] ?? [])
        .filter((row) =>
          filters.every((f) =>
            f.op === "eq" ? row[f.col] === f.val : f.op === "in" ? (f.val as unknown[]).includes(row[f.col]) : true
          )
        )
        .slice(0, lim);
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (col: string, val: unknown) => (filters.push({ op: "eq", col, val }), q),
      in: (col: string, val: unknown[]) => (filters.push({ op: "in", col, val }), q),
      order: () => q,
      limit: (n: number) => ((lim = n), q),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => resolve({ data: run(), error: null }),
      insert: () => (writes.push(`insert:${table}`), q),
      update: () => (writes.push(`update:${table}`), q),
      upsert: () => (writes.push(`upsert:${table}`), q),
    };
    return q;
  }
  return { sb: { from } as never, writes };
}

const OID = "aaaaaaaa-0000-4000-8000-000000000001";

describe("R1-B C-7 — order → CM room read-only fallback (same lookup order as canonical ensure)", () => {
  it("linked FK wins without any room query", async () => {
    const { sb } = fakeSb({});
    expect(await lookupStoreOrderMessengerRoomReadOnly(sb, OID, "cm-linked")).toEqual({ roomId: "cm-linked", source: "linked" });
  });

  it("FK null → domain_identity_key store_order:{id}", async () => {
    const { sb, writes } = fakeSb({
      community_messenger_rooms: [
        { id: "cm-id", chat_domain: "store_order", domain_identity_key: `store_order:${OID}`, room_type: "direct" },
        { id: "cm-dk", room_type: "direct", direct_key: `store_order:${OID}` },
      ],
    });
    expect(await lookupStoreOrderMessengerRoomReadOnly(sb, OID, null)).toEqual({ roomId: "cm-id", source: "domain_identity" });
    expect(writes).toEqual([]);
  });

  it("FK null, no identity → direct_key store_order:{id} / legacy trade_order:{id}", async () => {
    expect(storeOrderRoomDirectKeys(OID)).toEqual([`store_order:${OID}`, `trade_order:${OID}`]);
    const { sb, writes } = fakeSb({
      community_messenger_rooms: [{ id: "cm-legacy", room_type: "direct", direct_key: `trade_order:${OID}` }],
    });
    expect(await lookupStoreOrderMessengerRoomReadOnly(sb, OID, "")).toEqual({ roomId: "cm-legacy", source: "direct_key" });
    expect(writes).toEqual([]);
  });

  it("nothing found → null (viewer shows no-room copy; never creates)", async () => {
    const { sb, writes } = fakeSb({ community_messenger_rooms: [] });
    expect(await lookupStoreOrderMessengerRoomReadOnly(sb, OID, null)).toEqual({ roomId: null, source: null });
    expect(writes).toEqual([]);
  });

  it("batch: identity first, then direct keys", async () => {
    const O2 = "aaaaaaaa-0000-4000-8000-000000000002";
    const O3 = "aaaaaaaa-0000-4000-8000-000000000003";
    const { sb } = fakeSb({
      community_messenger_rooms: [
        { id: "r1", chat_domain: "store_order", domain_identity_key: `store_order:${OID}` },
        { id: "r2", room_type: "direct", direct_key: `store_order:${O2}` },
      ],
    });
    const map = await lookupStoreOrderMessengerRoomsBatchReadOnly(sb, [OID, O2, O3]);
    expect(map.get(OID)).toBe("r1");
    expect(map.get(O2)).toBe("r2");
    expect(map.has(O3)).toBe(false);
  });
});

describe("R1-B C-7 — order chat viewer data", () => {
  it("maps metadata into display (image / file / voice / order summary / system)", () => {
    const out = mapAdminStoreOrderChatMessages(
      [
        { id: "1", sender_id: "b", message_type: "image", content: "https://x/i.jpg", metadata: {}, created_at: "2026-10-19T01:00:00Z" },
        {
          id: "2",
          sender_id: "o",
          message_type: "file",
          content: "https://x/f.pdf",
          metadata: { fileName: "menu.pdf", fileSizeBytes: 2048 },
          created_at: "2026-10-19T02:00:00Z",
        },
        { id: "3", sender_id: "b", message_type: "voice", content: "https://x/v.m4a", metadata: { durationSeconds: 7 }, created_at: "2026-10-19T03:00:00Z" },
        {
          id: "4",
          sender_id: null,
          message_type: "system",
          content: "📋 [주문 요약] 주문번호: A-1",
          metadata: { kind: "store_order_summary", orderNo: "A-1", items: [{}, {}] },
          created_at: "2026-10-19T04:00:00Z",
        },
        { id: "5", sender_id: null, message_type: "system", content: "주문이 접수되었습니다", metadata: null, created_at: "2026-10-19T05:00:00Z" },
      ],
      { buyerUserId: "b", ownerUserId: "o", buyerLabel: "B", storeName: "S", profileLabel: () => "—" }
    );
    expect(out.map((m) => m.display.kind)).toEqual(["image", "file", "voice", "order_summary", "system"]);
    expect(out[0]!.display.imageUrls).toEqual(["https://x/i.jpg"]);
    expect(out[1]!.display).toMatchObject({ attachmentUrl: "https://x/f.pdf", fileName: "menu.pdf", fileSizeBytes: 2048 });
    expect(out[2]!.display).toMatchObject({ attachmentUrl: "https://x/v.m4a", voiceDurationSeconds: 7 });
    expect(out[3]!.display.orderSummary).toEqual({ orderNo: "A-1", orderStatus: "", itemCount: 2 });
  });

  it("loader stays lookup-only and pages latest-first; list is server-paginated (no whole-list cap)", () => {
    const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
    const loader = read("lib/admin-delivery-orders/load-admin-store-order-chat.ts");
    expect(loader).toContain("lookupStoreOrderMessengerRoomReadOnly");
    expect(loader).toContain("queryAdminCmMessagePage");
    expect(loader).toContain("metadata");
    expect(loader).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|unread_count|last_read/);
    const lookup = read("lib/admin-delivery-orders/store-order-room-lookup.ts");
    expect(lookup).not.toMatch(/\.insert\(|\.update\(|\.upsert\(/);
    const hub = read("app/admin/order-chats/page.tsx");
    expect(hub).not.toContain("120");
    // R7: 목록 전체 상한 문구 없음 — 상수는 한 페이지 최대 건수(서버 페이지네이션 limit 상한)
    expect(hub).not.toContain("ADMIN_STORE_ORDER_CHAT_LIST_LIMIT");
    expect(ADMIN_STORE_ORDER_CHAT_LIST_LIMIT).toBe(100);
    expect(read("lib/admin-delivery-orders/list-admin-store-order-chats.ts")).toContain("ADMIN_STORE_ORDER_CHAT_LIST_LIMIT");
  });
});
