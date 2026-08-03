import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { projectionInputFromBadgeCountAuthorityJson } from "@/lib/notifications/apply-badge-count-authority-response";

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Phase 5 Member A lifecycle contract", () => {
  it("mark_all_read uses Member A mark-all only", () => {
    const route = read("app/api/me/notifications/route.ts");
    expect(route).toContain("mark_all_read === true");
    expect(route).toContain("markMemberANotificationsAllRead");
    expect(route).not.toContain("markAllNotificationEventsRead");
  });

  it("admin note notify uses canonical createAndDispatch; no direct dispatchPushForUser", () => {
    const svc = read("lib/notifications/member-admin-notes-service.ts");
    expect(svc).toContain("createAndDispatchNotificationEvent");
    expect(svc).not.toContain("dispatchPushForUser");
    expect(svc).toContain("markMemberAdminNoteNotificationsRead");
  });

  it("transactional A push types are system not chat", () => {
    const dispatcher = read("lib/notifications/pipeline/notify-push-dispatcher.ts");
    expect(dispatcher).toContain('row.type === "trade_status"');
    expect(dispatcher).toContain('row.type === "order_status"');
    expect(dispatcher).toContain('row.type === "delivery_status"');
  });

  it("Apply prefers memberUnreadNotificationCount over notificationAttentionTotal", () => {
    const input = projectionInputFromBadgeCountAuthorityJson({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 0 },
      storeOrderBuyerDeliveryUnread: 0,
      notificationAttentionTotal: 99,
      memberUnreadNotificationCount: 2,
      orphanMissedCallCount: 0,
      projection: { bellTotal: 2 },
    });
    expect(input).not.toBeNull();
    expect(input!.notificationAttentionTotal).toBe(2);
    expect(input!.memberUnreadNotificationCount).toBe(2);
    expect(input!.bell?.total).toBe(2);
  });
});
