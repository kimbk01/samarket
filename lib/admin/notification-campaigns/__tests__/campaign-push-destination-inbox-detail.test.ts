import { describe, expect, it } from "vitest";
import { buildAdminCampaignNotificationPresentation } from "@/lib/admin/notification-campaigns/campaign-notification-presentation";
import { buildFcmDataFields } from "@/lib/push/dispatch/fcm-data-payload-contract";
import { resolvePushRouteFromFcmData } from "@/lib/push/resolve-push-route-from-fcm-data";

/** 재감사 2026-11-01 N1 — 목적지 = 알림센터 캠페인 푸시는 실제 알림 상세로 간다. */
const EVENT_ID = "2d2189c8-3c42-4c52-8909-2166dc47e987";

function wire(
  input: Parameters<typeof buildAdminCampaignNotificationPresentation>[0],
  opts?: Parameters<typeof buildAdminCampaignNotificationPresentation>[1]
) {
  const p = buildAdminCampaignNotificationPresentation(input, opts);
  return { p, fields: buildFcmDataFields(p.pushPayload, undefined, { tag: "campaign-tag" }) as Record<string, string | undefined> };
}

describe("campaign push destination — inbox detail (N1)", () => {
  it("목적지 없는 공지(앱 안 알림 있음) → 승인 경로 = /notifications/{이벤트 id}", () => {
    const { fields } = wire(
      { title: "디바이 알림", body: "본문", type: "notice", channel: "push_and_in_app", campaignId: "c1" },
      { userId: "u1", notificationEventId: EVENT_ID }
    );
    expect(fields.eventClass).toBe("admin_notice");
    expect(fields.targetKind).toBe("approved_internal_route");
    expect(fields.targetApprovedRoute).toBe(`/notifications/${EVENT_ID}`);
    expect(fields.targetNotificationId).toBe(EVENT_ID);
    expect(resolvePushRouteFromFcmData(fields)).toBe(`/notifications/${EVENT_ID}`);
  });

  it("목적지 없는 마케팅(앱 안 알림 있음) → 같은 상세", () => {
    const { fields } = wire(
      { title: "M", body: "B", type: "marketing", channel: "push_and_in_app", campaignId: "c2" },
      { userId: "u1", notificationEventId: EVENT_ID }
    );
    expect(fields.targetApprovedRoute).toBe(`/notifications/${EVENT_ID}`);
    expect(resolvePushRouteFromFcmData(fields)).toBe(`/notifications/${EVENT_ID}`);
  });

  it("지정 목적지가 있으면 그 경로 유지", () => {
    const { fields } = wire(
      {
        title: "N",
        body: "B",
        type: "notice",
        channel: "push_and_in_app",
        campaignId: "c3",
        deeplink_url: "/market",
      },
      { userId: "u1", notificationEventId: EVENT_ID }
    );
    expect(fields.targetApprovedRoute).toBe("/market");
    expect(resolvePushRouteFromFcmData(fields)).toBe("/market");
  });

  it("push_only 공지(앱 안 알림 없음) → 없는 상세(preview:) 주소를 만들지 않는다", () => {
    const { fields } = wire(
      { title: "N", body: "B", type: "notice", channel: "push_only", campaignId: "c4" },
      { userId: "u1", notificationEventId: null }
    );
    // 발송 tag 가 대상 id 로 쓰여 없는 상세(/notifications/{tag})로 가지 않게 알림센터를 명시
    expect(fields.targetKind).toBe("approved_internal_route");
    expect(fields.targetApprovedRoute).toBe("/notifications");
    expect(fields.targetNotificationId).toBeUndefined();
    expect(String(fields.notificationEventId ?? "")).not.toContain("preview:");
    expect(String(fields.notificationId ?? "")).not.toContain("preview:");
    const path = resolvePushRouteFromFcmData(fields) ?? "";
    expect(path.startsWith("/notifications/")).toBe(false);
    expect(path.startsWith("/notifications")).toBe(true);
  });

  it("관리자 미리보기는 기존처럼 preview id 를 쓴다", () => {
    const p = buildAdminCampaignNotificationPresentation({
      title: "N",
      body: "B",
      type: "notice",
      channel: "push_and_in_app",
      campaignId: "c5",
    });
    const meta = p.pushPayload.meta as Record<string, unknown>;
    expect(meta.targetNotificationId).toBe("preview:c5");
    expect(meta.targetApprovedRoute).toBeUndefined();
  });
});
