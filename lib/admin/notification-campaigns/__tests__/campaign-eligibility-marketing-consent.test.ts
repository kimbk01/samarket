/**
 * 받는 사람 규칙 (Owner 2026-11-03) — 알림함은 전원, 이벤트·마케팅 푸시는 혜택·이벤트 수신 동의(정본 1곳) 회원만.
 * 계획: docs/audit/marketing-consent-and-push-audience-plan-2026-11-03.md 단계 5.
 */
import { describe, expect, it } from "vitest";
import {
  campaignPushSkipReasonFromDecision,
  decideCampaignPushFromPreferences,
} from "@/lib/admin/notification-campaigns/campaign-eligibility";
import { normalizeNotificationPreferenceStorage } from "@/lib/notifications/policy/notification-preference-storage-normalizer";

/** 12:00 PHT — 방해금지 00:00~23:59 안 */
const NOW = new Date("2026-11-03T04:00:00.000Z");

// 「알림함 = 전원」: 회원별 알림함 거르기 함수(항상 참)는 삭제했다(확정 설계 B-4) — 발송 배치는 회원을 거르지 않고
// `sendCampaignToUser` 의 푸시 게이트만 회원 설정을 본다(run-campaign-send-batch 테스트가 검증).

function prefs(
  notificationSettingsRow: Record<string, unknown> | null,
  legacyUserSettingsRow: Record<string, unknown> | null = null
) {
  return normalizeNotificationPreferenceStorage({
    notificationSettingsRow: notificationSettingsRow as never,
    legacyUserSettingsRow: legacyUserSettingsRow as never,
    ownerSettingsRow: null,
    adminOpsPreferenceRow: null,
    now: NOW,
  });
}
const decide = (type: "notice" | "system" | "marketing", p: ReturnType<typeof prefs>) =>
  decideCampaignPushFromPreferences(type, "u1", p, NOW);

describe("푸시 = 동의·회원 설정 (발송·미리보기 같은 판정 · 재감사 C-2)", () => {
  it("이벤트·마케팅 — marketing_enabled 만 본다 (구 marketing_push_enabled 무시)", () => {
    expect(decide("marketing", prefs({ marketing_enabled: true, marketing_consent_source: "settings" })).allowed).toBe(true);
    // 2026-11-05 — 시스템 기본 ON(기존 회원 일괄)은 동의가 아니다
    expect(
      decide("marketing", prefs({ marketing_enabled: true, marketing_consent_source: "existing_member_default" })).skipReason
    ).toBe("marketing_not_opted_in");
    expect(decide("notice", prefs({ marketing_enabled: true, marketing_consent_source: "existing_member_default" })).allowed).toBe(true);
    expect(decide("marketing", prefs(null)).skipReason).toBe("marketing_not_opted_in");
    expect(decide("marketing", prefs({ marketing_enabled: false }, { marketing_push_enabled: true })).skipReason).toBe(
      "marketing_not_opted_in"
    );
  });

  it("공지·시스템 — 동의와 무관, 회원이 직접 끈 공지·전체 알림만 제외", () => {
    expect(decide("notice", prefs(null)).allowed).toBe(true);
    expect(decide("system", prefs({ marketing_enabled: false })).allowed).toBe(true);
    expect(decide("notice", prefs({ notice_enabled: false })).skipReason).toBe("notice_disabled");
    expect(decide("system", prefs({ notice_enabled: false })).skipReason).toBe("notice_disabled");
    expect(decide("notice", prefs(null, { push_enabled: false })).skipReason).toBe("service_disabled");
    expect(decide("marketing", prefs({ marketing_enabled: true, marketing_consent_source: "settings", service_enabled: false })).skipReason).toBe(
      "service_disabled"
    );
  });

  it("C-1: 공지는 「주문 알림」 설정을 보지 않는다", () => {
    expect(decide("notice", prefs({ order_enabled: false })).allowed).toBe(true);
    expect(decide("system", prefs({ order_enabled: false })).allowed).toBe(true);
  });

  it("방해금지 시간 = quiet_hours (동의 회원이라도 「미동의」로 적지 않음 · A-3)", () => {
    const quiet = { quiet_hours_enabled: true, quiet_hours_start: "00:00", quiet_hours_end: "23:59" };
    expect(decide("notice", prefs(quiet)).skipReason).toBe("quiet_hours");
    expect(decide("marketing", prefs({ ...quiet, marketing_enabled: true, marketing_consent_source: "settings" })).skipReason).toBe("quiet_hours");
  });
});

describe("발송 기록 사유 = 판정 결과 그대로 (A-3)", () => {
  it.each([
    ["master_push_disabled", "notice", "service_disabled"],
    ["marketing_opt_out", "marketing", "marketing_not_opted_in"],
    ["quiet_hours", "marketing", "quiet_hours"],
    ["domain_disabled", "notice", "notice_disabled"],
    ["domain_disabled", "system", "notice_disabled"],
    ["preference_read_failed", "notice", "policy_filtered"],
  ] as const)("%s (%s) → %s", (reason, type, expected) => {
    expect(
      campaignPushSkipReasonFromDecision(type, { sendPush: false, playSound: false, vibrate: false, reason })
    ).toBe(expected);
  });
});
