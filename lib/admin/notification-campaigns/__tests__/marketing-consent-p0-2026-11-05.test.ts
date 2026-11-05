/**
 * 광고성 알림 = 직접 동의 회원만 (Owner 2026-11-05 · 알림 설정 HARD LOCK 제한 재개).
 * - 시스템 기본 ON(existing_member_default)·admin_created·출처 없음 → 마케팅 캠페인 알림함·푸시 없음
 * - 설정 읽기 실패 → 마케팅 캠페인 알림함·푸시 없음 (fail-closed)
 * - 공지·시스템 캠페인은 그대로 (알림함 전원 · 푸시 게이트 기존 판정)
 * - 공지·시스템으로 광고 우회 → 확인 기록 없으면 발송 거부, 광고 표지어 있으면 거부
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

describe("공지·시스템 우회 차단 — 발송 직전 판정", () => {
  const noEvent = async () => null;
  const published = async () => ({ is_active: true });
  const NOTICE_ID = "6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b";

  it("확인 기록 없는 기존 공지 초안 → 발송 거부", async () => {
    const { evaluateOfficialCampaignSendEligibility } = await import(
      "@/lib/admin/notification-campaigns/campaign-source-authority"
    );
    const r = await evaluateOfficialCampaignSendEligibility(
      { type: "notice", title: "점검 안내", body: "b", target_payload: { appNoticeId: NOTICE_ID, content_type: "notice" } },
      noEvent,
      published
    );
    expect(r).toEqual({ ok: false, error: "non_promotional_attestation_required" });
  });

  it("확인 기록 + 광고 표지어 → 발송 거부 / 표지어 없음 → 통과", async () => {
    const { evaluateOfficialCampaignSendEligibility } = await import(
      "@/lib/admin/notification-campaigns/campaign-source-authority"
    );
    const payload = { appNoticeId: NOTICE_ID, content_type: "notice", non_promotional_attested: true };
    const promo = await evaluateOfficialCampaignSendEligibility(
      { type: "notice", title: "치킨 무료 구매 이벤트 마감", body: "b", target_payload: payload },
      noEvent,
      published
    );
    expect(promo).toEqual({ ok: false, error: "promotional_content_requires_marketing_type" });
    const ok = await evaluateOfficialCampaignSendEligibility(
      { type: "notice", title: "서버 점검 안내", body: "03:00~04:00", target_payload: payload },
      noEvent,
      published
    );
    expect(ok.ok).toBe(true);
  });

  it("마케팅 유형은 확인 기록·표지어 검사 대상이 아니다 (동의 판정으로 보호)", async () => {
    const { evaluateNonPromotionalCampaign } = await import("@/lib/admin/notification-campaigns/campaign-promotional-guard");
    expect(evaluateNonPromotionalCampaign({ type: "marketing", title: "무료 이벤트", target_payload: null })).toEqual({ ok: true });
    expect(evaluateNonPromotionalCampaign({ type: "system", title: "Update", target_payload: {} })).toMatchObject({
      ok: false,
      error: "non_promotional_attestation_required",
    });
    expect(
      evaluateNonPromotionalCampaign({ type: "system", title: "Big SALE today", target_payload: { non_promotional_attested: true } })
    ).toMatchObject({ ok: false, error: "promotional_content_requires_marketing_type" });
  });

  it("즉시·예약·테스트 발송 세 경로 모두 제목·내용을 판정에 넘긴다", () => {
    for (const f of [
      "app/api/admin/notification-campaigns/[campaignId]/send/route.ts",
      "lib/admin/notification-campaigns/claim-scheduled-campaign.ts",
      "lib/admin/notification-campaigns/campaign-test-send-service.ts",
    ]) {
      const src = read(f);
      const call = src.slice(src.indexOf("evaluateOfficialCampaignSendEligibility("));
      expect(call.slice(0, 700), f).toMatch(/title: \(\w+ as \{ title\?: string \| null \}\)\.title/);
      expect(call.slice(0, 700), f).toMatch(/body: \(\w+ as \{ body\?: string \| null \}\)\.body/);
    }
    expect(read("lib/admin/notification-campaigns/claim-scheduled-campaign.ts")).toContain(
      '.select("id, type, title, body, target_payload, deeplink_url, web_url, target_url")'
    );
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
