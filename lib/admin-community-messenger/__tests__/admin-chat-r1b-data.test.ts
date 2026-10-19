import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildAdminCmMessageDisplay } from "@/lib/admin-community-messenger/admin-message-display";
import {
  ADMIN_CM_MESSAGE_PAGE_DEFAULT,
  ADMIN_CM_MESSAGE_PAGE_MAX,
  clampAdminCmMessagePageLimit,
  queryAdminCmMessagePage,
  sliceAdminCmMessagePage,
} from "@/lib/admin-community-messenger/admin-message-page";
import {
  adminCmRoomDetailHref,
  adminStoreOrderDetailHref,
  adminTradeChatDetailHref,
  deriveAdminCmRoomDomainRef,
} from "@/lib/admin-community-messenger/room-domain-links";
import { shouldUpsertStoreOrderParticipants } from "@/lib/community-messenger/store-order-chat-service";
import { mapCanonicalStoreOrderEnsureError } from "@/lib/community-messenger/store-order-legacy-rooms-post";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("R1-B C-6 — admin message paging uses the user cursor semantics", () => {
  it("limit default 80 / max 100", () => {
    expect(clampAdminCmMessagePageLimit(undefined)).toBe(ADMIN_CM_MESSAGE_PAGE_DEFAULT);
    expect(clampAdminCmMessagePageLimit("500")).toBe(ADMIN_CM_MESSAGE_PAGE_MAX);
    expect(clampAdminCmMessagePageLimit(30)).toBe(30);
  });

  it("desc rows (limit+1) → asc page + hasMore", () => {
    expect(sliceAdminCmMessagePage(["c", "b", "a"], 2)).toEqual({ rows: ["b", "c"], hasMore: true });
    expect(sliceAdminCmMessagePage(["b", "a"], 2)).toEqual({ rows: ["a", "b"], hasMore: false });
  });

  it("latest page: no anchor, created_at desc + id desc, limit+1; before: lt anchor.created_at", async () => {
    const ops: string[] = [];
    const rows = [
      { id: "m3", created_at: "2026-10-19T03:00:00Z" },
      { id: "m2", created_at: "2026-10-19T02:00:00Z" },
      { id: "m1", created_at: "2026-10-19T01:00:00Z" },
    ];
    const sb = {
      from() {
        const filters: Array<[string, string, unknown]> = [];
        let lim = Infinity;
        const q: Record<string, unknown> = {
          select: () => q,
          eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), q),
          lt: (c: string, v: unknown) => (ops.push(`lt:${c}:${String(v)}`), filters.push(["lt", c, v]), q),
          order: (c: string, o: { ascending: boolean }) => (ops.push(`order:${c}:${o.ascending ? "asc" : "desc"}`), q),
          limit: (n: number) => (ops.push(`limit:${n}`), (lim = n), q),
          maybeSingle: async () => ({
            data: rows.find((r) => filters.some(([op, c, v]) => op === "eq" && c === "id" && r.id === v)) ?? null,
            error: null,
          }),
          then: (resolve: (v: unknown) => unknown) =>
            resolve({
              data: rows
                .filter((r) => filters.every(([op, c, v]) => (op === "lt" && c === "created_at" ? r.created_at < String(v) : true)))
                .slice(0, lim),
              error: null,
            }),
        };
        return q;
      },
    };
    const latest = await queryAdminCmMessagePage<{ id: string }>(sb, { roomId: "r", select: "id", limit: 2 });
    expect(latest).toEqual({ ok: true, rows: [rows[1], rows[0]], hasMore: true });
    expect(ops).toEqual(["order:created_at:desc", "order:id:desc", "limit:3"]);
    ops.length = 0;
    const older = await queryAdminCmMessagePage<{ id: string }>(sb, { roomId: "r", select: "id", before: "m2", limit: 2 });
    expect(older).toEqual({ ok: true, rows: [rows[2]], hasMore: false });
    expect(ops[0]).toBe("lt:created_at:2026-10-19T02:00:00Z");
    const missing = await queryAdminCmMessagePage(sb, { roomId: "r", select: "id", before: "nope" });
    expect(missing).toEqual({ ok: false, error: "anchor_not_found" });
  });

  it("CM admin detail loads the latest page (not oldest 300) and exposes messagesHasMore", () => {
    const svc = read("lib/admin-community-messenger/service.ts");
    expect(svc).toContain("queryAdminCmMessagePage");
    expect(svc).toContain("messagesHasMore");
    expect(svc).not.toMatch(/\.order\("created_at", \{ ascending: true \}\)\s*\.limit\(300\)/);
    expect(read("app/api/admin/community-messenger/rooms/[id]/messages/route.ts")).toContain("decideChatContentAccess");
  });
});

describe("R1-B — message display from metadata", () => {
  it("image album uses originals; text kept; call stub & other", () => {
    const img = buildAdminCmMessageDisplay({
      messageType: "image",
      content: "",
      metadata: { image_urls: ["https://x/1.jpg", "https://x/2.jpg"], image_thumb_urls: ["https://x/t1.jpg", "https://x/t2.jpg"] },
    });
    expect(img.kind).toBe("image");
    expect(img.imageUrls).toEqual(["https://x/1.jpg", "https://x/2.jpg"]);
    expect(buildAdminCmMessageDisplay({ messageType: "text", content: "hi", metadata: null })).toMatchObject({ kind: "text", text: "hi" });
    expect(
      buildAdminCmMessageDisplay({ messageType: "call_stub", content: "", metadata: { callKind: "voice", callStatus: "missed" } })
    ).toMatchObject({ kind: "call_stub", callKind: "voice", callStatus: "missed" });
    expect(buildAdminCmMessageDisplay({ messageType: "sticker", content: "", metadata: {} }).kind).toBe("other");
  });

  it("file without URL content keeps the text and has no attachment URL", () => {
    const d = buildAdminCmMessageDisplay({ messageType: "file", content: "not-a-url", metadata: { fileName: "a.txt" } });
    expect(d).toMatchObject({ kind: "file", attachmentUrl: null, fileName: "a.txt", text: "not-a-url" });
  });
});

describe("R1-B — CM room ↔ domain cross links", () => {
  it("store_order from identity / direct key", () => {
    expect(deriveAdminCmRoomDomainRef({ chatDomain: "store_order", domainIdentityKey: "store_order:o1" })).toEqual({
      domain: "store_order",
      storeOrderId: "o1",
      tradeLegacyRoomId: null,
      tradePostId: null,
    });
    expect(deriveAdminCmRoomDomainRef({ directKey: "trade_order:o2" }).storeOrderId).toBe("o2");
  });

  it("trade from direct key + identity", () => {
    expect(
      deriveAdminCmRoomDomainRef({ chatDomain: "trade", directKey: "trade_item:cr1", domainIdentityKey: "trade:item1:s:b" })
    ).toEqual({ domain: "trade", storeOrderId: null, tradeLegacyRoomId: "cr1", tradePostId: "item1" });
    expect(deriveAdminCmRoomDomainRef({ directKey: "trade_pc:pc1" })).toMatchObject({ domain: "trade", tradeLegacyRoomId: "pc1" });
  });

  it("general / group never get domain links", () => {
    expect(deriveAdminCmRoomDomainRef({ chatDomain: "general_direct", directKey: "a:b" })).toMatchObject({
      domain: "general_direct",
      storeOrderId: null,
      tradeLegacyRoomId: null,
    });
    expect(deriveAdminCmRoomDomainRef({ roomType: "private_group" }).domain).toBe("group");
  });

  it("hrefs carry returnTo (admin paths only)", () => {
    expect(adminCmRoomDetailHref("r1", "/admin/stores/orders/o1/chat")).toBe(
      `/admin/chats/messenger/r1?returnTo=${encodeURIComponent("/admin/stores/orders/o1/chat")}`
    );
    expect(adminStoreOrderDetailHref("o1", "https://evil")).toBe("/admin/stores/orders/o1");
    expect(adminTradeChatDetailHref("cr1", null)).toBe("/admin/chats/cr1");
  });
});

describe("R1-B C-18 / C-19 — store order room ensure", () => {
  it("C-19: non-entry paths keep a participant who left (no upsert on an existing room)", () => {
    expect(shouldUpsertStoreOrderParticipants({ mode: "rejoin", roomCreated: false })).toBe(true);
    expect(shouldUpsertStoreOrderParticipants({ mode: "keep_left", roomCreated: false })).toBe(false);
    expect(shouldUpsertStoreOrderParticipants({ mode: "keep_left", roomCreated: true })).toBe(true);
    const svc = read("lib/community-messenger/store-order-chat-service.ts");
    expect(svc.match(/participantsMode: "keep_left"/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("C-18: legacy rooms POST maps canonical errors to the old response codes", () => {
    expect(mapCanonicalStoreOrderEnsureError("forbidden")).toBe("not_participant");
    expect(mapCanonicalStoreOrderEnsureError("order_not_found")).toBe("store_order_not_found");
    expect(mapCanonicalStoreOrderEnsureError("participants_missing")).toBe("order_chat_invalid");
    expect(mapCanonicalStoreOrderEnsureError("")).toBe("room_failed");
  });
});
