import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Phase J3 App Icon authority (Android / native)", () => {
  it("NativeBadgeSync writes only Domain appIconTotal (never Bell total / events SUM)", () => {
    const src = read("components/push/NativeBadgeSync.tsx");
    expect(src).toContain("surface.appIconTotal");
    expect(src).toContain("syncNativeBadgeCount(n)");
    expect(src).toContain("clearNativeBadgeCount");
    expect(src).toContain("resolveNativeBadgeSyncWrite");
    expect(src).toContain("getProjectionAuthorityState");
    expect(src).not.toMatch(/useNotificationBadgeTotal/);
    expect(src).not.toMatch(/fetchNotificationBadgeCount/);
    expect(src).not.toMatch(/badgeCountSnap\?\.total/);
    expect(src).not.toContain("getAppIconBadgeProjection");
    expect(src).not.toContain("generation > 0");
  });

  it("push dispatcher FCM badge_count uses Domain appIconTotal", () => {
    const src = read("lib/notifications/pipeline/notify-push-dispatcher.ts");
    expect(src).toContain("fetchDomainBadgeAuthorityPayload");
    expect(src).toContain("appIconTotal");
    expect(src).not.toContain("fetchNotificationBadgeCount");
  });

  it("order-chat nativeBadgeTotal uses Domain appIconTotal", () => {
    const src = read("lib/order-domain/read-order-chat.ts");
    expect(src).toContain("domain.projection?.appIconTotal");
    expect(src).not.toContain("fetchNotificationBadgeCount");
  });

  it("syncNativeBadgeCount call sites are NativeBadgeSync + logout durable clear", () => {
    const sync = read("lib/push/native/sync-native-badge-count.ts");
    expect(sync).toContain("Badge.set");
    expect(sync).toContain("blocked_pending_logout_clear");
    const native = read("components/push/NativeBadgeSync.tsx");
    const flow = read("lib/auth/explicit-logout-flow.ts");
    const wipe = read("lib/auth/client-session-wipe.ts");
    expect(native).toContain("syncNativeBadgeCount");
    expect(native).toContain("recoverPendingLogoutBadgeClearTransaction");
    expect(flow).toContain("beginLogoutBadgeClearTransaction");
    expect(wipe).not.toContain("clearNativeBadgeCount");
  });
});
