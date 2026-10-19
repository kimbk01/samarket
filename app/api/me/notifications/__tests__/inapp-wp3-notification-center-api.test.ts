/**
 * WP3 — 알림센터 API contracts.
 * INAPP-02 server category mark-all · INAPP-03 single-item ownership.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getRouteUserId = vi.fn<() => Promise<string | null>>();
const getSupabaseServer = vi.fn();
const markMemberANotificationsAllRead = vi.fn();

vi.mock("@/lib/auth/get-route-user-id", () => ({
  getRouteUserId: () => getRouteUserId(),
}));

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => getSupabaseServer(),
}));

vi.mock("@/lib/notifications/inbox-read-bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notifications/inbox-read-bridge")>();
  return {
    ...actual,
    markMemberANotificationsAllRead: (...args: unknown[]) => markMemberANotificationsAllRead(...args),
  };
});

vi.mock("@/lib/notifications/pipeline/notify-badge-service", () => ({
  invalidateNotificationBadgeCache: vi.fn(),
}));

const VIEWER = "11111111-1111-4111-8111-111111111111";
const NOTIF_ID = "22222222-2222-4222-8222-222222222222";

function patchReq(body: unknown) {
  return new NextRequest("http://localhost/api/me/notifications", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** Minimal PostgREST chain recorder for notification_events single-row reads. */
function eventsClient(rows: Record<string, unknown>[]) {
  const eqCalls: [string, unknown][] = [];
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return q;
    },
    limit: async () => ({
      data: rows.filter((r) =>
        eqCalls.every(([col, val]) => (col in r ? r[col] === val : true))
      ),
      error: null,
    }),
  };
  return { sb: { from: vi.fn(() => q) }, eqCalls };
}

const noticeEvent = {
  id: NOTIF_ID,
  user_id: VIEWER,
  type: "admin_notice",
  category: "admin_notice",
  title: "공지",
  body: "본문",
  display_payload: { campaignType: "notice" },
  read_at: null,
  created_at: "2026-10-01T00:00:00.000Z",
  dedupe_key: "n1",
  room_id: null,
};

describe("PATCH /api/me/notifications — 모두 읽음 (INAPP-02)", () => {
  beforeEach(() => {
    vi.resetModules();
    getRouteUserId.mockReset();
    getSupabaseServer.mockReset();
    markMemberANotificationsAllRead.mockReset();
    getRouteUserId.mockResolvedValue(VIEWER);
    getSupabaseServer.mockReturnValue({ from: vi.fn() });
    markMemberANotificationsAllRead.mockResolvedValue({ legacyUpdated: 0, eventUpdated: 7, updated: 7 });
  });

  it("marks all canonical A unread on the server (no ids from loaded rows)", async () => {
    const { PATCH } = await import("@/app/api/me/notifications/route");
    const res = await PATCH(patchReq({ mark_my_notifications_read_excluding_owner_and_chat: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, eventUpdated: 7 });
    expect(markMemberANotificationsAllRead).toHaveBeenCalledTimes(1);
    expect(markMemberANotificationsAllRead.mock.calls[0]![1]).toBe(VIEWER);
    expect(markMemberANotificationsAllRead.mock.calls[0]![2]).toEqual({ domain: null });
  });

  it("scopes mark-all to the selected category tab", async () => {
    const { PATCH } = await import("@/app/api/me/notifications/route");
    const res = await PATCH(
      patchReq({ mark_my_notifications_read_excluding_owner_and_chat: true, category: "trade" })
    );
    expect(res.status).toBe(200);
    expect(markMemberANotificationsAllRead.mock.calls[0]![2]).toEqual({ domain: "trade" });
  });

  it('"all" category means every category', async () => {
    const { PATCH } = await import("@/app/api/me/notifications/route");
    await PATCH(patchReq({ mark_all_read: true, category: "all" }));
    expect(markMemberANotificationsAllRead.mock.calls[0]![2]).toEqual({ domain: null });
  });

  it("rejects unknown category with 400 and marks nothing", async () => {
    const { PATCH } = await import("@/app/api/me/notifications/route");
    const res = await PATCH(
      patchReq({ mark_my_notifications_read_excluding_owner_and_chat: true, category: "chat" })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_category" });
    expect(markMemberANotificationsAllRead).not.toHaveBeenCalled();
  });

  it("mark-all failure is not reported as success", async () => {
    markMemberANotificationsAllRead.mockResolvedValue({ ok: false, error: "mark_all_failed" });
    const { PATCH } = await import("@/app/api/me/notifications/route");
    const res = await PATCH(patchReq({ mark_my_notifications_read_excluding_owner_and_chat: true }));
    expect(res.status).toBe(500);
  });
});

describe("GET /api/me/notifications/:id — single item (INAPP-03)", () => {
  beforeEach(() => {
    vi.resetModules();
    getRouteUserId.mockReset();
    getSupabaseServer.mockReset();
  });

  async function get(id: string) {
    const { GET } = await import("@/app/api/me/notifications/[notificationId]/route");
    return GET(new NextRequest(`http://localhost/api/me/notifications/${id}`), {
      params: Promise.resolve({ notificationId: id }),
    });
  }

  it("401 without session", async () => {
    getRouteUserId.mockResolvedValue(null);
    const res = await get(NOTIF_ID);
    expect(res.status).toBe(401);
  });

  it("returns the viewer's own row and scopes the query by user_id", async () => {
    getRouteUserId.mockResolvedValue(VIEWER);
    const { sb, eqCalls } = eventsClient([noticeEvent]);
    getSupabaseServer.mockReturnValue(sb);
    const res = await get(NOTIF_ID);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; notification: { id: string; is_read: boolean } };
    expect(body.ok).toBe(true);
    expect(body.notification.id).toBe(NOTIF_ID);
    expect(body.notification.is_read).toBe(false);
    expect(eqCalls).toContainEqual(["user_id", VIEWER]);
    expect(eqCalls).toContainEqual(["id", NOTIF_ID]);
  });

  it("another member's notification is 404 (indistinguishable from missing)", async () => {
    getRouteUserId.mockResolvedValue("33333333-3333-4333-8333-333333333333");
    const { sb } = eventsClient([noticeEvent]);
    getSupabaseServer.mockReturnValue(sb);
    const res = await get(NOTIF_ID);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "not_found" });
  });

  it("malformed id is 404 without a DB round trip", async () => {
    getRouteUserId.mockResolvedValue(VIEWER);
    const { sb } = eventsClient([noticeEvent]);
    getSupabaseServer.mockReturnValue(sb);
    const res = await get("not-a-uuid");
    expect(res.status).toBe(404);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it("soft-dismissed (deleted) and chat rows are not served as detail", async () => {
    getRouteUserId.mockResolvedValue(VIEWER);
    const { sb } = eventsClient([
      { ...noticeEvent, display_payload: { inbox_dismissed_at: "2026-10-02T00:00:00.000Z" } },
    ]);
    getSupabaseServer.mockReturnValue(sb);
    expect((await get(NOTIF_ID)).status).toBe(404);

    const chat = eventsClient([
      { ...noticeEvent, type: "chat_message", category: "chat", room_id: "44444444-4444-4444-8444-444444444444" },
    ]);
    getSupabaseServer.mockReturnValue(chat.sb);
    expect((await get(NOTIF_ID)).status).toBe(404);
  });
});
