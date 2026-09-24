import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildOwnerDeliveryOwnerRoomLocationPath } from "@/lib/business/owner-order-chat-ensure-document";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("owner order-chat ensure document redirect", () => {
  it("uses Route Handler GET with HTTP 307 (no page soft redirect)", () => {
    const route = read("app/(main)/stores/owner/order-chat/[orderId]/route.ts");
    expect(route).toContain("export async function GET");
    expect(route).toContain("NextResponse.redirect");
    expect(route).toContain("307");
    expect(route).toContain("resolveOwnerOrderChatEnsureDocument");
    expect(() => read("app/(main)/stores/owner/order-chat/[orderId]/page.tsx")).toThrow();
  });

  it("does not change member ensure page soft redirect", () => {
    const member = read("app/(main)/orders/store/[orderId]/chat/page.tsx");
    expect(member).toContain("redirect(");
    expect(member).toContain('from", "delivery"');
  });

  it("does not treat /order-chats as ensure route handler", () => {
    const listPage = read("app/(main)/stores/owner/order-chats/page.tsx");
    expect(listPage.length).toBeGreaterThan(0);
    expect(read("lib/business/owner-path-request-header.ts")).toContain(
      'pathname.startsWith("/stores/owner/order-chat/")'
    );
  });

  it("preserves delivery-owner room query contract", () => {
    const href = buildOwnerDeliveryOwnerRoomLocationPath(
      {
        ok: true,
        roomId: "room-1",
        orderNo: "SO1",
        storeId: "store-1",
        storeName: "맛집",
        buyerUserId: "b",
        ownerUserId: "o",
      } as any,
      "order-1"
    );
    expect(href.startsWith("/community-messenger/rooms/room-1?")).toBe(true);
    expect(href).toContain("from=delivery-owner");
    expect(href).toContain("cm_list=delivery");
    expect(href).toContain("cm_ctx=");
    expect(href).toContain("cm_return=");
  });
});
