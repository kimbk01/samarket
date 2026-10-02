import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseClientMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => getSupabaseClientMock(),
}));

import {
  fetchAdminChatRoomsApi,
  fetchAdminChatRoomsListApi,
} from "@/lib/admin-chats/fetchAdminChatRoomsApi";
import { getAdminChatRoomsFromDb } from "@/lib/admin-chats/getAdminChatRoomsFromDb";

describe("ADMIN-07 admin chat list fetch error ≠ empty chats", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    getSupabaseClientMock.mockReset();
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

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

  it("T1 — API HTTP non-2xx rejects (not success [])", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => [],
    });
    await expect(fetchAdminChatRoomsApi()).rejects.toThrow(/admin_chat_rooms_api_http_500/);
    await expect(fetchAdminChatRoomsListApi()).rejects.toThrow(/admin_chat_rooms_list_api_http_500/);
  });

  it("T2 — API HTTP 2xx + empty resolves []", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ rooms: [] }),
      });
    await expect(fetchAdminChatRoomsApi()).resolves.toEqual([]);
    await expect(fetchAdminChatRoomsListApi()).resolves.toEqual([]);
  });

  it("T3 — DB client/query failure rejects (not success [])", async () => {
    getSupabaseClientMock.mockReturnValue(null);
    await expect(getAdminChatRoomsFromDb()).rejects.toThrow(/admin_chat_db_client_unavailable/);

    const order = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "rest_blocked" },
    });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });
    getSupabaseClientMock.mockReturnValue({ from });
    await expect(getAdminChatRoomsFromDb()).rejects.toThrow(/rest_blocked/);
  });

  it("T4 — DB query success + rows 0 resolves []", async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });
    getSupabaseClientMock.mockReturnValue({ from });
    await expect(getAdminChatRoomsFromDb()).resolves.toEqual([]);
  });
});
