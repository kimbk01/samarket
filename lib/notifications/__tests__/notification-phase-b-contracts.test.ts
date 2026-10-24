import { describe, expect, it } from "vitest";
import { buildAdminCampaignNotificationPresentation } from "@/lib/admin/notification-campaigns/campaign-notification-presentation";
import { access } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveNotificationDestination } from "@/lib/notifications/resolve-notification-destination";
import { resolveNotificationDeepLink } from "@/lib/notifications/policy/notification-deeplink-policy";

describe("admin campaign presentation SSOT", () => {
  it("uses split push/in-app images and canonical route", () => {
    const p = buildAdminCampaignNotificationPresentation({
      title: "Hello",
      body: "World",
      type: "notice",
      channel: "push_and_in_app",
      deeplink_url: "/community-messenger",
      push_image_url: "https://cdn.example/push.png",
      in_app_image_url: "https://cdn.example/bell.png",
      campaignId: "camp-1",
    });
    expect(p.pushImageUrl).toContain("push.png");
    expect(p.inAppImageUrl).toContain("bell.png");
    expect(p.deepLink).toBe("/community-messenger");
    expect(p.pushPayload.title).toBe("Hello");
    expect(p.inAppPresentation.imageUrl).toContain("bell.png");
    expect(p.bellPolicy).toBeTruthy();
    expect(p.soundPolicyKey).toBeTruthy();
  });
});

describe("resolveNotificationDestination", () => {
  it("blocks javascript: urls via inbox row", () => {
    const dest = resolveNotificationDestination({
      inboxRow: {
        notification_type: "system",
        link_url: "javascript:alert(1)",
        meta: null,
      },
    });
    expect(dest.href).not.toContain("javascript:");
    expect(dest.href.startsWith("/")).toBe(true);
  });

  it("matches deep-link facade for chat room", () => {
    const roomId = "11111111-1111-1111-1111-111111111111";
    const dest = resolveNotificationDestination({
      resolverKey: "chat_room",
      roomId,
      fallbackHref: "/notifications",
    });
    const facade = resolveNotificationDeepLink("chat_room", { roomId });
    expect(dest.href).toBe(facade);
  });
});

/**
 * 상호 친구 요청(묶음6) 이후 Owner 승인(1단계 문서 F-7·F-8): 요청 받음·수락 알림은
 * 기존 appendUserNotification 경로(status · push_kind community)만 쓴다 — 새 알림 종류·네이티브 구조 없음.
 */
describe("friend request notifications (mutual request · existing notification path only)", () => {
  it("uses appendUserNotification with existing types and a per-day dedupe key", async () => {
    const path = join(process.cwd(), "lib/notifications/community-messenger-friend-inapp-notify.ts");
    await expect(access(path)).resolves.toBeUndefined();
    const src = readFileSync(path, "utf8");
    expect(src).toContain("appendUserNotification");
    expect(src).toContain('notification_type: "status"');
    expect(src).toContain('push_kind: "community"');
    expect(src).toContain("cm_friend_request:");
    expect(src).toContain("cm_friend_accepted:");
    expect(src).not.toMatch(/web-push|fcm|apns|voip/i);
  });
});
