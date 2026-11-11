import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 쓰는 코드를 실행한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/runtime", () => ({ getSiteOrigin: () => "https://app.example" }));

import { buildAdminCampaignNotificationPresentation } from "@/lib/admin/notification-campaigns/campaign-notification-presentation";
import { buildFcmDataFields } from "@/lib/push/dispatch/fcm-data-payload-contract";
import { resolvePushRouteFromFcmData } from "@/lib/push/resolve-push-route-from-fcm-data";
import { shouldApplyMemberNotificationReadOnPushTap } from "@/lib/notifications/badge-authority-rebuild/push-routing-transport";

/**
 * C2 목적지 계약 (재감사 2026-11-01 · W2) — 캠페인 푸시.
 * 전체 행렬은 notification-route-contract.test.ts 의 공용 기준표(Android 와 같은 파일)가 잠근다.
 */
const EVT = "2d2189c8-3c42-4c52-8909-2166dc47e987";

function wire(
  input: Parameters<typeof buildAdminCampaignNotificationPresentation>[0],
  opts?: Parameters<typeof buildAdminCampaignNotificationPresentation>[1]
) {
  const p = buildAdminCampaignNotificationPresentation(input, opts);
  return {
    p,
    fields: buildFcmDataFields(p.pushPayload, undefined, { tag: "campaign-tag" }) as Record<string, string | undefined>,
  };
}

describe("campaign push destination (C2)", () => {
  it("앱 안 행이 있으면 저장된 최종 목적지를 url 로만 싣고 봉투를 싣지 않는다", () => {
    const { fields } = wire(
      { title: "디바이 알림", body: "본문", type: "notice", channel: "push_and_in_app", campaignId: "c1" },
      { userId: "u1", notificationEventId: EVT, finalRouteUrl: `/notifications/${EVT}` }
    );
    expect(fields.url).toBe(`/notifications/${EVT}`);
    expect(fields.schemaVersion).toBeUndefined();
    expect(fields.eventClass).toBeUndefined();
    expect(fields.targetApprovedRoute).toBeUndefined();
    expect(resolvePushRouteFromFcmData(fields)).toBe(`/notifications/${EVT}`);
  });

  it("시스템 캠페인도 같은 규칙(Android 에서 admin_system 분기 없이 url 로 이동)", () => {
    const { fields } = wire(
      { title: "점검", body: "b", type: "system", channel: "push_and_in_app", campaignId: "c2", deeplink_url: "/market" },
      { userId: "u1", notificationEventId: EVT, finalRouteUrl: "/market" }
    );
    expect(fields.eventClass).toBeUndefined();
    expect(fields.url).toBe("/market");
  });

  it("push_only(행 없음)·목적지 없음 → 알림센터 안내 경로, 없는 상세(preview:·tag)를 만들지 않는다", () => {
    const { fields } = wire(
      { title: "N", body: "B", type: "notice", channel: "push_only", campaignId: "c4" },
      { userId: "u1", notificationEventId: null }
    );
    expect(fields.url).toBe("/notifications?fallback=push_only");
    expect(fields.targetApprovedRoute).toBe("/notifications?fallback=push_only");
    expect(fields.targetNotificationId).toBeUndefined();
    expect(String(fields.notificationEventId ?? "")).not.toContain("preview:");
    expect(resolvePushRouteFromFcmData(fields)).toBe("/notifications?fallback=push_only");
  });

  it("C4: 행이 있는 마케팅 푸시 탭은 목록 탭처럼 읽음 처리(이전: iOS·웹 delivery_only 로 안 읽음)", () => {
    const { fields } = wire(
      { title: "M", body: "B", type: "marketing", channel: "push_and_in_app", campaignId: "c5" },
      { userId: "u1", notificationEventId: EVT, finalRouteUrl: `/notifications/${EVT}` }
    );
    expect(fields.recipientScope).toBe("member");
    expect(
      shouldApplyMemberNotificationReadOnPushTap({
        path: fields.url,
        recipientScope: fields.recipientScope,
        pipeline: fields.pipeline,
        type: fields.type,
      })
    ).toBe(true);
  });

  it("push_only 마케팅은 행이 없어 읽을 대상이 없다(delivery_only 유지)", () => {
    const { fields } = wire(
      { title: "M", body: "B", type: "marketing", channel: "push_only", campaignId: "c6", deeplink_url: "/market" },
      { userId: "u1", notificationEventId: null }
    );
    expect(fields.recipientScope).toBe("delivery_only");
  });

  it("관리자 미리보기는 기존처럼 preview id 를 쓴다", () => {
    const p = buildAdminCampaignNotificationPresentation({
      title: "N",
      body: "B",
      type: "notice",
      channel: "push_and_in_app",
      campaignId: "c7",
    });
    const meta = p.pushPayload.meta as Record<string, unknown>;
    expect(meta.targetNotificationId).toBe("preview:c7");
    expect(meta.targetApprovedRoute).toBeUndefined();
  });
});
