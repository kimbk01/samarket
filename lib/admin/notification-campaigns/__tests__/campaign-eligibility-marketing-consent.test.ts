/**
 * 받는 사람 규칙 (Owner 2026-11-03) — 알림함은 전원, 이벤트·마케팅 푸시는 혜택·이벤트 수신 동의(정본 1곳) 회원만.
 * 계획: docs/audit/marketing-consent-and-push-audience-plan-2026-11-03.md 단계 5.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateCampaignPushPreference,
  evaluateCampaignUserEligibility,
  type SettingsMaps,
} from "@/lib/admin/notification-campaigns/campaign-eligibility";

function maps(
  notif: Record<string, Record<string, boolean>>,
  prefs: Record<string, Record<string, boolean>> = {}
): SettingsMaps {
  return { notif: new Map(Object.entries(notif)), prefs: new Map(Object.entries(prefs)) };
}

describe("알림함 = 전원", () => {
  it.each(["notice", "system", "marketing"] as const)("%s — 동의·설정 없어도 알림함 대상", (type) => {
    expect(evaluateCampaignUserEligibility(type, "u1", maps({}))).toEqual({ eligible: true, skipReason: null });
    expect(
      evaluateCampaignUserEligibility(type, "u1", maps({ u1: { marketing_enabled: false, service_enabled: false } }))
    ).toEqual({ eligible: true, skipReason: null });
  });
});

describe("푸시 = 동의·회원 설정", () => {
  it("이벤트·마케팅 — marketing_enabled 만 본다 (구 marketing_push_enabled 무시)", () => {
    expect(evaluateCampaignPushPreference("marketing", "u1", maps({ u1: { marketing_enabled: true } })).allowed).toBe(true);
    expect(evaluateCampaignPushPreference("marketing", "u1", maps({})).skipReason).toBe("marketing_not_opted_in");
    expect(
      evaluateCampaignPushPreference("marketing", "u1", maps({ u1: { marketing_enabled: false } })).skipReason
    ).toBe("marketing_not_opted_in");
  });

  it("공지·시스템 — 동의와 무관, 회원이 직접 끈 공지·전체 알림만 제외", () => {
    expect(evaluateCampaignPushPreference("notice", "u1", maps({})).allowed).toBe(true);
    expect(evaluateCampaignPushPreference("system", "u1", maps({ u1: { marketing_enabled: false } })).allowed).toBe(true);
    expect(evaluateCampaignPushPreference("notice", "u1", maps({ u1: { notice_enabled: false } })).skipReason).toBe(
      "notice_disabled"
    );
    expect(evaluateCampaignPushPreference("notice", "u1", maps({}, { u1: { push_enabled: false } })).skipReason).toBe(
      "service_disabled"
    );
  });
});
