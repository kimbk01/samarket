import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ADMIN-07 admin chat list fetch error ≠ empty chats", () => {
  it("AdminChatListPage settles fetches instead of catch→[] empty-as-success", () => {
    const src = readFileSync(
      resolve(process.cwd(), "components/admin/chats/AdminChatListPage.tsx"),
      "utf8"
    );
    expect(src).toContain("loadFailed");
    expect(src).toContain("settleRooms");
    expect(src).toContain("admin_chat_domain_list_error");
    expect(src).not.toMatch(/fetchAdminChatRoomsApi\(\)\s*\.catch\(\s*\(\)\s*=>\s*\[\]\s*\)/);
    expect(src).not.toMatch(/getAdminChatRoomsFromDb\(\)\s*\.catch\(\s*\(\)\s*=>\s*\[\]\s*\)/);
    const failIdx = src.indexOf("loadFailed && rooms.length === 0");
    const emptyTradeIdx = src.indexOf("admin_chat_empty_trade");
    expect(failIdx).toBeGreaterThan(-1);
    expect(emptyTradeIdx).toBeGreaterThan(failIdx);
  });
});
