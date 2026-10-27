/**
 * F2 보완 (docs/audit/notification-f2-android-tap-read-fix-design-2026-10-28.md A).
 * Android 네이티브 탭은 `{ path, notificationId }` 만 넘긴다 → 웹이 `requireMemberA` 로 요청하고,
 * 서버는 종(A) 기준을 통과한 본인 알림만 읽음 처리한다. 행 모양은 운영 DB 실측(2026-10-28)과 같다.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const USER = "0c4b0a80-9755-4ebe-9a10-f8e1ced4c0cc";

const ROWS: Record<string, Record<string, unknown>> = {
  // 가격 제안 수락 — 이동 경로가 메신저 방이지만 상태 알림(A)
  offerAccepted: {
    id: "offerAccepted",
    user_id: USER,
    type: "trade_status",
    category: "trade_status",
    unread: true,
    read_at: null,
    room_id: null,
    dedupe_key: `legacy:${USER}:status:a742035f`,
    muted_snapshot: false,
    display_payload: {
      routeUrl: "/community-messenger/rooms/69a248c1?source=chat_room",
      legacyMeta: { kind: "trade_offer", event: "offer_accepted" },
      legacyNotificationType: "status",
    },
  },
  // 1:1 채팅 메시지 — B
  chat: {
    id: "chat",
    user_id: USER,
    type: "chat_message",
    category: "chat_message",
    unread: true,
    read_at: null,
    room_id: "1de13b3e",
    dedupe_key: "msg:1de13b3e:acf754be",
    muted_snapshot: false,
    display_payload: { routeUrl: "/community-messenger/rooms/1de13b3e", chatDomain: "general_direct" },
  },
  // 오너 새 주문 — 오너 운영 (A 아님)
  ownerOrder: {
    id: "ownerOrder",
    user_id: USER,
    type: "order_status",
    category: "order_status",
    unread: true,
    read_at: null,
    room_id: null,
    dedupe_key: "commerce:owner:new_order:df5ffc7a",
    muted_snapshot: false,
    display_payload: {
      routeUrl: "/stores/owner/orders?storeId=076bffda&tab=new",
      legacyMeta: { kind: "store_order_created", store_id: "076bffda" },
      legacyNotificationType: "commerce",
    },
  },
};

const markNotificationRead = vi.fn(async () => true);
const eqCalls: Array<[string, string]> = [];

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => USER }));
vi.mock("@/lib/notifications/pipeline/notify-read-service", () => ({
  markNotificationRead: (...args: unknown[]) => markNotificationRead(...(args as [])),
}));
vi.mock("@/lib/admin/notification-campaigns/campaign-delivery-recorder", () => ({
  markCampaignDeliveryOpened: async () => undefined,
  markCampaignDeliveryDismissed: async () => undefined,
}));
vi.mock("@/lib/notifications/pipeline/domain-badge-read-ack", () => ({
  issueDomainBadgeAuthorityForAck: async () => null,
  domainBadgeReadMutationAckFields: () => ({}),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({
    from: () => {
      const filters: Record<string, string> = {};
      const q = {
        select: () => q,
        eq: (col: string, val: string) => {
          eqCalls.push([col, val]);
          filters[col] = val;
          return q;
        },
        maybeSingle: async () => {
          const row = ROWS[filters.id];
          if (!row || row.user_id !== filters.user_id) return { data: null, error: null };
          return { data: row, error: null };
        },
      };
      return q;
    },
  }),
}));

async function post(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/me/notifications/read/route");
  const res = await POST(
    new Request("http://localhost/api/me/notifications/read", {
      method: "POST",
      body: JSON.stringify(body),
    }) as never
  );
  return (await res.json()) as { ok: boolean; skipped?: string };
}

describe("F2 Android tap read — server Member A gate", () => {
  beforeEach(() => {
    markNotificationRead.mockClear();
    eqCalls.length = 0;
  });

  it("status notification on a room path is read (A)", async () => {
    const j = await post({ notificationEventId: "offerAccepted", opened: true, requireMemberA: true });
    expect(j.ok).toBe(true);
    expect(markNotificationRead).toHaveBeenCalledTimes(1);
    expect(eqCalls).toContainEqual(["user_id", USER]);
  });

  it("chat message is refused without a write (B stays on room read ACK)", async () => {
    const j = await post({ notificationEventId: "chat", opened: true, requireMemberA: true });
    expect(j).toEqual({ ok: false, skipped: "not_member_a" });
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it("owner operation notification is refused without a write", async () => {
    const j = await post({ notificationEventId: "ownerOrder", opened: true, requireMemberA: true });
    expect(j).toEqual({ ok: false, skipped: "not_member_a" });
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it("another member's / missing event is refused without a write", async () => {
    const j = await post({ notificationEventId: "missing", opened: true, requireMemberA: true });
    expect(j.ok).toBe(false);
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it("without requireMemberA the existing behavior is unchanged", async () => {
    const j = await post({ notificationEventId: "chat", opened: true });
    expect(j.ok).toBe(true);
    expect(markNotificationRead).toHaveBeenCalledTimes(1);
  });
});

describe("F2 Android tap read — listener fallback", () => {
  it("unclassified tap (no pipeline/type) asks the server with requireMemberA", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "components/push/PushRouteListener.tsx"), "utf8");
    expect(src).toContain("if (!transport?.pipeline?.trim() && !transport?.type?.trim()) {");
    expect(src).toContain("void postNotificationEventOpenedRead(id, { requireMemberA: true });");
    const client = fs.readFileSync(
      path.join(process.cwd(), "lib/notifications/client/notification-event-read-client.ts"),
      "utf8"
    );
    expect(client).toContain("requireMemberA: true");
  });
});
