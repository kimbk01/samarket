/**
 * 광고성 알림 = 직접 동의 회원만 (Owner 2026-11-05 · 알림 설정 HARD LOCK 제한 재개).
 * - 시스템 기본 ON(existing_member_default)·admin_created·출처 없음 → 마케팅 캠페인 알림함·푸시 없음
 * - 설정 읽기 실패 → 마케팅 캠페인 알림함·푸시 없음 (fail-closed)
 * - 공지·시스템 캠페인은 그대로 (알림함 전원 · 푸시 게이트 기존 판정)
 * - 공지·시스템으로 광고 우회 → 기존 원본 규칙(이벤트·마케팅 글은 마케팅 유형만)으로 막는다. 정상 공지는 추가 확인 없이 발송
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createNotificationEvent = vi.fn();
const dispatchPushForUser = vi.fn();
const loadActivePushTargets = vi.fn();
const evaluateCampaignPushGate = vi.fn();
const recordCampaignDelivery = vi.fn();

vi.mock("@/lib/notifications/core/notification-event-repository", () => ({
  createNotificationEvent: (...args: unknown[]) => createNotificationEvent(...args),
}));
vi.mock("@/lib/push/dispatch/dispatch-push-for-user", () => ({
  dispatchPushForUser: (...args: unknown[]) => dispatchPushForUser(...args),
}));
vi.mock("@/lib/push/dispatch/load-active-push-targets", () => ({
  loadActivePushTargets: (...args: unknown[]) => loadActivePushTargets(...args),
}));
vi.mock("@/lib/admin/notification-campaigns/campaign-eligibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/notification-campaigns/campaign-eligibility")>();
  return {
    ...actual,
    evaluateCampaignPushGate: (...args: unknown[]) => evaluateCampaignPushGate(...args),
  };
});
vi.mock("@/lib/admin/notification-campaigns/campaign-delivery-recorder", () => ({
  recordCampaignDelivery: (...args: unknown[]) => recordCampaignDelivery(...args),
}));
vi.mock("@/lib/notifications/pipeline/notify-badge-service", () => ({
  fetchDomainBadgeAuthorityPayload: async () => ({ projection: { appIconTotal: 0, bellTotal: 0 } }),
}));

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const baseCampaign = {
  id: "camp-1",
  type: "marketing" as const,
  target_type: "all",
  title: "Hello",
  body: "World",
  channel: "push_and_in_app" as const,
  target_url: null,
  image_url: null,
  deeplink_url: "/market",
  web_url: null,
  push_image_url: null,
  in_app_image_url: null,
  priority: "normal" as const,
  visibility_policy: "default" as const,
  target_payload: null,
  segment_region_code: null,
  send_progress_offset: 0,
  status: "sending",
  sent_count: 0,
  skipped_count: 0,
  failed_count: 0,
  target_count: 0,
};

type SettingsRead = { data: Record<string, unknown>[] | null; error: { message: string } | null };

function svcMock(settings: SettingsRead) {
  return {
    from(table: string) {
      if (table === "user_notification_settings") {
        return { select: () => ({ in: async () => settings }) };
      }
      if (table === "user_settings") {
        return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
      }
      return { upsert: async () => ({ error: null }) };
    },
  };
}

const row = (marketing_enabled: boolean, marketing_consent_source: string | null) => ({
  data: [{ user_id: "u1", marketing_enabled, marketing_consent_source }],
  error: null,
});

describe("마케팅 캠페인 — 직접 동의 회원만 알림함·푸시", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const m of [createNotificationEvent, dispatchPushForUser, loadActivePushTargets, evaluateCampaignPushGate, recordCampaignDelivery]) {
      m.mockReset();
    }
    recordCampaignDelivery.mockResolvedValue("del-1");
    createNotificationEvent.mockResolvedValue({
      ok: true,
      row: { id: "evt-1", user_id: "u1", display_payload: {}, created_at: new Date().toISOString() },
    });
    loadActivePushTargets.mockResolvedValue([]);
  });

  for (const source of ["existing_member_default", "admin_created", null]) {
    it(`저장값 true + 출처 ${String(source)} → 알림함·푸시 없음 (marketing_not_opted_in)`, async () => {
      const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
      const out = await sendCampaignToUser(svcMock(row(true, source)) as never, baseCampaign, "occ-1", "u1");
      expect(out).toMatchObject({ ok: true, sent: false, skipped: true, skipReason: "marketing_not_opted_in" });
      expect(createNotificationEvent).not.toHaveBeenCalled();
      expect(loadActivePushTargets).not.toHaveBeenCalled();
      expect(dispatchPushForUser).not.toHaveBeenCalled();
      expect(recordCampaignDelivery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ channel: "in_app", status: "skipped", skipReason: "marketing_not_opted_in" })
      );
      expect(recordCampaignDelivery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ channel: "push", status: "skipped", skipReason: "marketing_not_opted_in" })
      );
    });
  }

  for (const source of ["signup", "settings"]) {
    it(`직접 동의(${source}) → 알림함 생성 · 푸시 게이트로 진행`, async () => {
      loadActivePushTargets.mockResolvedValue([
        { id: "dev-1", source: "user_devices", push_provider: "fcm", push_token: "tok", platform: "android", device_id: "d1" },
      ]);
      evaluateCampaignPushGate.mockResolvedValue({ allowed: true, skipReason: null });
      dispatchPushForUser.mockResolvedValue({ ok: true, targets_found: 1, deliveries: [{ status: "sent", device_id: "dev-1", provider_response: {} }] });
      const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
      const out = await sendCampaignToUser(svcMock(row(true, source)) as never, baseCampaign, "occ-1", "u1");
      expect(out.sent).toBe(true);
      expect(createNotificationEvent).toHaveBeenCalledTimes(1);
      expect(evaluateCampaignPushGate).toHaveBeenCalledTimes(1);
      expect(dispatchPushForUser).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ skip_settings_gate: true }));
    });
  }

  it("설정 읽기 실패 → 알림함·푸시 없음 (fail-closed · policy_filtered)", async () => {
    const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
    const out = await sendCampaignToUser(
      svcMock({ data: null, error: { message: "timeout" } }) as never,
      baseCampaign,
      "occ-1",
      "u1"
    );
    expect(out).toMatchObject({ skipped: true, skipReason: "policy_filtered" });
    expect(createNotificationEvent).not.toHaveBeenCalled();
    expect(dispatchPushForUser).not.toHaveBeenCalled();
  });

  it("설정 행 없음(NO_ROW) → 기본값 = 미동의 → 알림함·푸시 없음", async () => {
    const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
    const out = await sendCampaignToUser(svcMock({ data: [], error: null }) as never, baseCampaign, "occ-1", "u1");
    expect(out.skipReason).toBe("marketing_not_opted_in");
    expect(createNotificationEvent).not.toHaveBeenCalled();
  });

  it("공지 캠페인은 그대로 — 동의 판정 없이 알림함 생성", async () => {
    const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
    const out = await sendCampaignToUser(
      svcMock(row(true, "existing_member_default")) as never,
      { ...baseCampaign, type: "notice" },
      "occ-1",
      "u1"
    );
    expect(createNotificationEvent).toHaveBeenCalledTimes(1);
    expect(out.sent).toBe(true);
  });
});

describe("공지·시스템 — 정상 발송 유지 · 유형 우회는 원본 규칙으로 차단", () => {
  const noEvent = async () => null;
  const published = async () => ({ is_active: true });
  const NOTICE_ID = "6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b";

  it("기존 공지 초안(추가 확인 기록 없음) → 발송 가능", async () => {
    const { evaluateOfficialCampaignSendEligibility } = await import(
      "@/lib/admin/notification-campaigns/campaign-source-authority"
    );
    const r = await evaluateOfficialCampaignSendEligibility(
      { type: "notice", target_payload: { appNoticeId: NOTICE_ID, content_type: "notice" } },
      noEvent,
      published
    );
    expect(r.ok).toBe(true);
  });

  it("공지·시스템은 마케팅 글·이벤트 화면에 묶을 수 없다", async () => {
    const { validateOfficialCampaignSource, CAMPAIGN_APP_ROUTE_DESTINATION } = await import(
      "@/lib/admin/notification-campaigns/campaign-source-authority"
    );
    expect(
      validateOfficialCampaignSource({
        campaign_type: "notice",
        target_payload: { content_id: NOTICE_ID, content_type: "marketing" },
      })
    ).toEqual({ ok: false, error: "invalid_content_bind" });
    expect(
      validateOfficialCampaignSource({
        campaign_type: "system",
        target_payload: { content_id: NOTICE_ID, content_type: "marketing" },
      })
    ).toEqual({ ok: false, error: "invalid_content_bind" });
    expect(
      validateOfficialCampaignSource({
        campaign_type: "notice",
        target_payload: { destination: CAMPAIGN_APP_ROUTE_DESTINATION },
        deeplink_url: "/events/evt-1",
      })
    ).toEqual({ ok: false, error: "notice_content_required" });
  });

  it("「이벤트」 분류는 마케팅 유형으로 저장된다 (동의 판정 대상)", async () => {
    const { campaignTypeForNoticeCategory } = await import("@/lib/admin/notification-campaigns/campaign-list-kind");
    expect(campaignTypeForNoticeCategory("event")).toBe("marketing");
  });
});

describe("HARD LOCK 계약 1~6 유지 (회귀)", () => {
  it("fail-closed catch · READ_FAILED 구분 · skip_settings_gate 그대로", () => {
    expect(read("lib/admin/notification-campaigns/campaign-eligibility.ts")).toMatch(/\}\)\.catch\(\(\) => false\);/);
    expect(read("lib/push/dispatch/dispatch-push-for-user.ts")).toMatch(/\.catch\(\s*\(\) => false\s*\)/);
    expect(read("lib/admin/notification-campaigns/campaign-send-user.ts")).toContain("skip_settings_gate: true");
    const reader = read("lib/notifications/policy/notification-preference-storage-reader.server.ts");
    expect(reader).toContain("NOTIFICATION_PREFERENCE_READ_FAILED_PREFIX");
    expect(reader).toContain("marketing_consent_source");
  });
});
