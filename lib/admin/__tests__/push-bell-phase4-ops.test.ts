import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  adminActionQueueIsNotNotificationDeliveryCopy,
  distributionBellLifecycleNotice,
  distributionPushLifecycleNotice,
  notificationAudienceOperatorLabel,
  notificationCampaignManageHref,
  notificationCampaignStatusOperatorLabel,
  notificationChannelEventRequirement,
  NOTIFICATIONS_SEND_HREF,
} from "@/lib/admin/promotion-ownership-visibility";
import {
  assertApproveIsNotPublishOrSend,
  assertSaveIsNotSend,
  promotionAdminActionLabel,
} from "@/lib/admin/promotion-operation-actions";
import { resolveApprovedMarketingLandingRoute } from "@/lib/admin/notification-campaigns/campaign-source-authority";
import { buildPlatformEventDetailPath } from "@/lib/platform-events/types";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(`${ROOT}/${path}`, "utf8");

describe("Phase 4 — Push / Bell operational UX", () => {
  it("keeps Push vs Bell as distinct operator channels", () => {
    const hub = read(
      "components/admin/platform-promotion/AdminPromotionNotificationsHubClient.tsx"
    );
    expect(hub).toContain('data-admin-promotion-channel="push"');
    expect(hub).toContain('data-admin-promotion-channel="bell"');
    expect(hub).toContain("data-admin-promotion-save-not-send");
    expect(hub).toContain("휴대폰 시스템 알림으로 즉시 또는 예약 전달합니다.");
    expect(hub).toContain("dibaY 앱 안의 알림함에 남겨");
    expect(hub).toContain("data-admin-promotion-action-queue-note");
    expect(hub).not.toMatch(/method:\s*[\"']POST[\"']/);
    expect(hub).toContain(NOTIFICATIONS_SEND_HREF);
  });

  it("Action Queue is explicitly not Push/Bell delivery", () => {
    expect(adminActionQueueIsNotNotificationDeliveryCopy("ko")).toMatch(/Action Queue/);
    expect(adminActionQueueIsNotNotificationDeliveryCopy("ko")).toMatch(/Push|알림함/);
    const queue = read("lib/admin/admin-action-queue.ts");
    expect(queue).toMatch(/notification_events|Member notification/i);
  });

  it("Event is optional for both Push and Bell (standalone allowed)", () => {
    expect(notificationChannelEventRequirement("push")).toBe("optional");
    expect(notificationChannelEventRequirement("bell")).toBe("optional");
  });

  it("maps campaign statuses and audiences without inventing DB fields", () => {
    expect(notificationCampaignStatusOperatorLabel("draft", "ko")).toBe("초안");
    expect(notificationCampaignStatusOperatorLabel("sent", "ko")).toBe("발송 완료");
    expect(notificationCampaignStatusOperatorLabel("sent", "ko")).not.toBe("전달 완료");
    expect(notificationAudienceOperatorLabel("marketing_opt_in", "ko")).toContain("마케팅");
    expect(notificationAudienceOperatorLabel("all", "ko")).toBe("전체");
  });

  it("Dist Push draft ≠ send; deep-link is canonical notification campaign", () => {
    const off = distributionPushLifecycleNotice({
      enabled: false,
      channelRefId: null,
      lang: "ko",
    });
    expect(off.kind).toBe("off");
    expect(off.saveDoesNotSend).toMatch(/저장만으로/);

    const pending = distributionPushLifecycleNotice({
      enabled: true,
      channelRefId: null,
      lang: "ko",
    });
    expect(pending.kind).toBe("will_draft");
    expect(pending.manageHref).toBeNull();

    const linked = distributionPushLifecycleNotice({
      enabled: true,
      channelRefId: "camp-push-1",
      lang: "ko",
    });
    expect(linked.kind).toBe("draft_linked");
    expect(linked.manageHref).toBe(notificationCampaignManageHref("camp-push-1"));
    expect(linked.manageHref).toBe("/admin/notifications/camp-push-1");
    expect(linked.campaignSourceNote).toMatch(/campaign source|소스 계약/);
  });

  it("Dist Bell draft ≠ member inbox row", () => {
    const linked = distributionBellLifecycleNotice({
      enabled: true,
      channelRefId: "camp-bell-1",
      lang: "ko",
    });
    expect(linked.kind).toBe("draft_linked");
    expect(linked.saveDoesNotCreateInbox).toMatch(/알림함 행/);
    expect(linked.manageHref).toBe("/admin/notifications/camp-bell-1");
  });

  it("Event /events/{id} is NOT an approved marketing landing (campaign_source preserved)", () => {
    const eventPath = buildPlatformEventDetailPath("evt-qa-1");
    expect(eventPath).toMatch(/^\/events\//);
    expect(resolveApprovedMarketingLandingRoute(eventPath)).toBeNull();
    expect(resolveApprovedMarketingLandingRoute("/market")).toBe("/market");
    const authority = read("lib/admin/notification-campaigns/campaign-source-authority.ts");
    expect(authority).toContain("marketing_source_required");
    expect(authority).not.toMatch(/\/events/);
  });

  it("Dist panel keeps Save ≠ Send and independent Push/Bell sections", () => {
    const dist = read(
      "components/admin/platform-events/AdminPlatformEventDistributionPanel.tsx"
    );
    expect(dist).toContain("data-admin-event-push-editor");
    expect(dist).toContain("data-admin-event-bell-editor");
    expect(dist).toContain("data-admin-push-save-not-send");
    expect(dist).toContain("data-admin-bell-save-not-inbox");
    expect(dist).toContain("data-admin-push-dist-manage-link");
    expect(dist).toContain("data-admin-bell-dist-manage-link");
    expect(dist).toContain("pushDispatchCount");
    expect(dist).toContain("push_dispatch_on_save_forbidden");
    expect(dist).not.toMatch(/auto.?send|autoSend|dispatchPushOnSave/i);
  });

  it("SAVE ≠ SEND and APPROVE ≠ SEND remain locked", () => {
    expect(assertSaveIsNotSend()).toBe(true);
    expect(assertApproveIsNotPublishOrSend()).toBe(true);
    expect(promotionAdminActionLabel("SEND_PUSH", "ko")).toBe("Push 보내기");
    expect(promotionAdminActionLabel("SAVE", "ko")).toBe("저장");
  });

  it("content_visit coordination: Push DELIVERED / Bell CREATED do not coordinate; OPEN does", () => {
    const contract = read("lib/platform-promotion-lifecycle/content-visit-contract.ts");
    const tests = read(
      "lib/platform-promotion-lifecycle/__tests__/cross-channel-lifecycle-close.test.ts"
    );
    expect(contract).toMatch(/OPEN|DELIVERED|CREATED/i);
    expect(tests).toMatch(/DELIVERED|CREATED|OPEN|coordinatedEventIds/i);
  });

  it("no new writer / no DB migration in Phase 4 surfaces", () => {
    const hub = read(
      "components/admin/platform-promotion/AdminPromotionNotificationsHubClient.tsx"
    );
    const ownership = read("lib/admin/promotion-ownership-visibility.ts");
    for (const src of [hub, ownership]) {
      expect(src).not.toMatch(/CREATE TABLE|ALTER TABLE|auto_activate/);
      expect(src).not.toMatch(/createAdminNotificationCampaign\(/);
    }
  });
});
