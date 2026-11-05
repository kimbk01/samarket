/**
 * 운영자 알림 재감사 단계 1 (Owner 「단계 1 구현」 2026-11-03)
 * 설계: docs/audit/admin-push-consent-full-reaudit-design-2026-11-03.md
 */
import { describe, expect, it } from "vitest";
import { parseCampaignWriteInput } from "@/lib/admin/notification-campaigns/campaign-input";
import {
  buildAdminCampaignNotificationPresentation,
  campaignPushPreferenceProbe,
} from "@/lib/admin/notification-campaigns/campaign-notification-presentation";
import { resolveWebPushPreferenceEventType } from "@/lib/notifications/web-push-user-settings-gate";

const body = {
  title: "공지",
  body: "본문",
  type: "notice",
  target_type: "all",
  deeplink_url: "/mypage/customer-center/notice/366d11ab-c19f-497a-9894-04ff4f3225bc",
  target_payload: {
    notice_category: "notice",
    content_type: "notice",
    content_id: "366d11ab-c19f-497a-9894-04ff4f3225bc",
    non_promotional_attested: true,
  },
};

describe("B-2: 「푸시만」은 새 알림에서 쓰지 않는다", () => {
  it("새 작성의 push_only → 조용히 바꾸지 않고 거부 (확정 설계 B-3)", () => {
    const parsed = parseCampaignWriteInput({ ...body, channel: "push_only" }, { hasOwnTargetPayload: true });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.status).toBe(400);
    expect(parsed.error).toBe("push_only_retired");
  });

  it("새 작성의 「광고 수신 동의 회원」 대상 → 거부 · 예전 행 수정은 유지 (확정 설계 B-16)", () => {
    const rejected = parseCampaignWriteInput({ ...body, target_type: "marketing_opt_in" }, { hasOwnTargetPayload: true });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error).toBe("marketing_opt_in_retired");
    const kept = parseCampaignWriteInput(
      { ...body, target_type: "marketing_opt_in" },
      { hasOwnTargetPayload: true, keepLegacyMarketingOptIn: true }
    );
    if (!kept.ok) throw new Error(`parse failed: ${kept.error}`);
    expect(kept.fields.target_type).toBe("marketing_opt_in");
  });

  it("예전 push_only 알림 수정은 그대로", () => {
    const parsed = parseCampaignWriteInput(
      { ...body, channel: "push_only" },
      { hasOwnTargetPayload: true, keepLegacyPushOnly: true }
    );
    if (!parsed.ok) throw new Error(`parse failed: ${parsed.error}`);
    expect(parsed.fields.channel).toBe("push_only");
  });
});

describe("C-1: 공지 푸시의 설정 판정 종류", () => {
  it.each([
    ["notice", "notice_published"],
    ["system", "notice_published"],
    ["marketing", "admin_marketing_banner"],
  ] as const)("%s → %s (실제 발송 묶음과 미리보기 묶음이 같다)", (type, expected) => {
    const real = buildAdminCampaignNotificationPresentation(
      { title: "t", body: "b", type, channel: "push_and_in_app", deeplink_url: "/notifications", campaignId: "c1", target_type: "all" },
      { userId: "u1", notificationEventId: "e1", finalRouteUrl: "/notifications", badgeCount: 0, occurredAt: new Date(0).toISOString() }
    ).pushPayload;
    expect(resolveWebPushPreferenceEventType(real)).toBe(expected);
    expect(resolveWebPushPreferenceEventType(campaignPushPreferenceProbe(type, "u1"))).toBe(expected);
  });
});
