import { describe, expect, it } from "vitest";
import { buildAdminCampaignNotificationPresentation } from "@/lib/admin/notification-campaigns/campaign-notification-presentation";
import { access } from "node:fs/promises";
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

describe("friend notification retire", () => {
  it("does not restore deleted friend-inapp-notify module", async () => {
    await expect(
      access(join(process.cwd(), "lib/notifications/community-messenger-friend-inapp-notify.ts"))
    ).rejects.toBeTruthy();
  });
});
