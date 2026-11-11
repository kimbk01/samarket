/**
 * 운영자 알림 남은 결함 확정 설계 (Owner 「설계안 승인」 2026-11-04) — docs/audit/admin-push-fix-confirmed-design-2026-11-04.md
 */
import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 쓰는 코드를 실행한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decideCampaignPushFromPreferences } from "@/lib/admin/notification-campaigns/campaign-eligibility";
import { campaignResultBadge } from "@/lib/admin/notification-campaigns/campaign-list-kind";
import { buildAdminCampaignNotificationPresentation } from "@/lib/admin/notification-campaigns/campaign-notification-presentation";
import { isCampaignDeliveryReceivedStatus } from "@/lib/admin/notification-campaigns/campaign-types";
import { normalizeNotificationPreferenceStorage } from "@/lib/notifications/policy/notification-preference-storage-normalizer";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** 12:00 PHT — 방해금지 00:00~23:59 안 */
const NOW = new Date("2026-11-03T04:00:00.000Z");
const QUIET = { quiet_hours_enabled: true, quiet_hours_start: "00:00", quiet_hours_end: "23:59" };
const prefs = (row: Record<string, unknown>) =>
  normalizeNotificationPreferenceStorage({
    notificationSettingsRow: row as never,
    legacyUserSettingsRow: null,
    ownerSettingsRow: null,
    adminOpsPreferenceRow: null,
    now: NOW,
  });

describe("B-1 열람 = 회원이 연 것만", () => {
  it("읽음 서버 함수는 `campaignOpened` 일 때만 운영자 알림 열람을 기록한다", () => {
    const src = read("lib/notifications/inbox-read-bridge.ts");
    expect(src).toMatch(/if \(opts\?\.campaignOpened === true\) \{\s*await markCampaignDeliveriesOpenedForEvents/);
  });

  it("앱 안 열기(행·배너·상세)는 알림함 기록만 「열람」으로", () => {
    const src = read("lib/admin/notification-campaigns/campaign-delivery-recorder.ts");
    const fn = src.slice(src.indexOf("export async function markCampaignDeliveriesOpenedForEvents"));
    expect(fn.slice(0, 600)).toContain('.eq("channel", "in_app")');
  });

  it("열기 4곳만 `opened: true` · 밀어서 읽음은 보내지 않음", () => {
    expect(read("components/my/MyNotificationsView.tsx")).toContain("markRead: (ids) => markIdsRead(ids, { opened: true }),");
    expect(read("components/philife/PhilifeHeaderNotificationInbox.tsx")).toContain(
      "markRead: (ids) => markIdsRead(ids, { opened: true }),"
    );
    expect(read("components/philife/PhilifeHeaderNotificationInbox.tsx")).toContain(
      "onSwipeRead={(item) => void markIdsRead(item.ids)}"
    );
    expect(read("components/notifications/InAppNotificationBannerHost.tsx")).toContain("JSON.stringify({ ids, opened: true })");
    expect(read("app/(main)/notifications/[notificationId]/page.tsx")).toContain("JSON.stringify({ ids: [found.id], opened: true })");
  });
});

describe("B-2 막힌 이유 — 영역 사유가 방해금지보다 먼저", () => {
  it("미동의 + 방해금지 → 미동의", () => {
    expect(decideCampaignPushFromPreferences("marketing", "u1", prefs({ ...QUIET, marketing_enabled: false }), NOW).skipReason).toBe(
      "marketing_not_opted_in"
    );
  });
  it("공지 끔 + 방해금지 → 공지 끔", () => {
    expect(decideCampaignPushFromPreferences("notice", "u1", prefs({ ...QUIET, notice_enabled: false }), NOW).skipReason).toBe(
      "notice_disabled"
    );
  });
  it("동의 + 방해금지 → 방해금지", () => {
    expect(decideCampaignPushFromPreferences("marketing", "u1", prefs({ ...QUIET, marketing_enabled: true, marketing_consent_source: "settings" }), NOW).skipReason).toBe(
      "quiet_hours"
    );
  });
});

describe("B-8 배지 숫자를 모르면 싣지 않는다", () => {
  const campaign = { title: "t", body: "b", type: "notice" as const, channel: "push_and_in_app" as const, campaignId: "c1" };
  it("badgeCount 없음 → badge_count 없음 (iPhone 숫자 지우지 않음)", () => {
    const p = buildAdminCampaignNotificationPresentation(campaign as never, { userId: "u1", notificationEventId: "e1" });
    expect(JSON.stringify(p.pushPayload)).not.toContain("badge_count");
  });
  it("badgeCount 있음 → 그대로", () => {
    const p = buildAdminCampaignNotificationPresentation(campaign as never, { userId: "u1", notificationEventId: "e1", badgeCount: 7 });
    expect(JSON.stringify(p.pushPayload)).toContain('"badge_count":7');
  });
});

describe("B-13 결과 배지", () => {
  const stats = (o: Partial<{ push_fail: number; push_none: number; target: number; inbox: number }>) => ({
    push_fail: 0,
    push_none: 0,
    ...o,
  });
  it("대상 0명 → 「대상 없음」(전부 성공 아님)", () => {
    expect(campaignResultBadge({ status: "sent", stats: stats({ target: 0, inbox: 0 }) })).toBe("empty");
  });
  it("알림함 전용 → 푸시 「없음」으로 보지 않음", () => {
    expect(
      campaignResultBadge({ status: "sent", channel: "in_app_only", stats: stats({ target: 3, inbox: 3, push_none: 3 }) })
    ).toBe("inbox_only");
    expect(
      campaignResultBadge({ status: "sent", channel: "in_app_only", stats: stats({ target: 3, inbox: 2, push_none: 3 }) })
    ).toBe("fail");
  });
});

describe("B-17 닫음 = 받음 · 열람을 덮지 않음", () => {
  it("dismissed 는 받음(성공)으로 센다", () => {
    expect(isCampaignDeliveryReceivedStatus("dismissed")).toBe(true);
    expect(isCampaignDeliveryReceivedStatus("skipped")).toBe(false);
  });
  it("닫음 기록은 sent/pending 푸시 행만", () => {
    const src = read("lib/admin/notification-campaigns/campaign-delivery-recorder.ts");
    const fn = src.slice(src.indexOf("export async function markCampaignDeliveryDismissed"));
    expect(fn.slice(0, 700)).toContain('.in("status", ["sent", "pending"])');
    expect(fn.slice(0, 700)).not.toContain('"opened"]');
  });
});

describe("B-18 테스트 발송 권한·횟수", () => {
  it("본인 외 회원 → manage 권한 · 관리자당 분당 10회", () => {
    const src = read("app/api/admin/notification-campaigns/test-send/route.ts");
    expect(src).toContain("userIds.some((uid) => uid !== admin.userId)");
    expect(src).toContain('requireAdminPermission("manage")');
    expect(src).toContain("enforceAdminCampaignTestSendQuota(admin.userId)");
  });
});
