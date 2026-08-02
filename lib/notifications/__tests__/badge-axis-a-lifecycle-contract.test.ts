import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("badge axis A lifecycle contract (Phase 2)", () => {
  it("createAndDispatch invalidates badge cache on successful insert", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/pipeline/notification-event-dispatcher.ts"),
      "utf8"
    );
    expect(src).toContain("invalidateNotificationBadgeCache");
    expect(src).toMatch(/created\.ok[\s\S]*invalidateNotificationBadgeCache/);
  });

  it("mark_all_read legacy path excludes chat + missed + owner", () => {
    const src = readFileSync(join(process.cwd(), "app/api/me/notifications/route.ts"), "utf8");
    expect(src).toContain("mark_all_read === true");
    expect(src).toContain("isInAppChatMessageNotificationRow");
    expect(src).toContain('kind === "missed_call"');
    expect(src).toContain("isOwnerStoreCommerceNotificationRow");
  });

  it("delete_all_member_a API exists and uses A-only delete helper", () => {
    const route = readFileSync(join(process.cwd(), "app/api/me/notifications/route.ts"), "utf8");
    const bridge = readFileSync(
      join(process.cwd(), "lib/notifications/inbox-read-bridge.ts"),
      "utf8"
    );
    expect(route).toContain("delete_all_member_a");
    expect(route).toContain("deleteAllMemberANotificationEvents");
    expect(bridge).toContain("export async function deleteAllMemberANotificationEvents");
    expect(bridge).toContain("missed_call");
    expect(bridge).toContain("isOwnerStoreCommerceNotificationRow");
  });

  it("push tap marks opened via postNotificationEventOpenedRead", () => {
    const src = readFileSync(join(process.cwd(), "components/push/PushRouteListener.tsx"), "utf8");
    expect(src).toContain("postNotificationEventOpenedRead");
    expect(src).toContain("notificationId");
  });

  it("Tier1 mark-all optimistic zeros full Member A", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/client/notification-events-read-resync.ts"),
      "utf8"
    );
    expect(src).toContain('kind: "member_notification_a_absolute"');
    expect(src).toContain("applyTier1InboxDeleteAllMemberAOptimistic");
  });
});
