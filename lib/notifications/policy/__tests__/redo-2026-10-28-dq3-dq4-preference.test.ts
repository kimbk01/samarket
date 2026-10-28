import { describe, expect, it } from "vitest";
import { resolveEffectiveNotificationPreference } from "@/lib/notifications/policy/effective-notification-preference";
import { defaultNormalizedNotificationPreferences } from "@/lib/notifications/policy/notification-preference-normalized-snapshot";
import { STORE_SETTING_GOVERNED_META_KINDS } from "@/lib/notifications/policy/notification-preference-policy-registry";

function prefsWithMember(member: Partial<ReturnType<typeof defaultNormalizedNotificationPreferences>["member"]>) {
  const base = defaultNormalizedNotificationPreferences();
  return { ...base, member: { ...base.member!, ...member } };
}

describe("D-Q4 (Owner 2026-10-28) — 제재·운영 조치 통지는 필수", () => {
  for (const kind of [
    "trade_moderation",
    "trade_sanction",
    "community_moderation",
    "community_sanction",
    "community_meeting_decision",
    "chat_report_sanction",
  ]) {
    it(`${kind}: 해당 토글을 꺼도 푸시`, () => {
      const r = resolveEffectiveNotificationPreference({
        metaKind: kind,
        recipientRole: "member",
        preferences: prefsWithMember({
          tradeEventsEnabled: false,
          communitySocialEnabled: false,
          noticeEnabled: false,
          pushEnabled: false,
        }),
      });
      expect(r.mandatory).toBe(true);
      expect(r.sendPush).toBe(true);
    });
  }

  for (const kind of ["trade_report_processed", "community_report_processed", "chat_report_result"]) {
    it(`${kind}: 신고자 처리 결과는 일반(토글 따름)`, () => {
      const r = resolveEffectiveNotificationPreference({
        metaKind: kind,
        recipientRole: "member",
        preferences: prefsWithMember({
          tradeEventsEnabled: false,
          communitySocialEnabled: false,
          noticeEnabled: false,
        }),
      });
      expect(r.mandatory).toBe(false);
    });
  }
});

describe("D-Q3 (Owner 2026-10-28) — 「매장·상점 알림」 토글이 실제로 적용", () => {
  it("store_enabled=false → 매장 운영 알림 푸시·앱 안 소리 차단", () => {
    for (const kind of STORE_SETTING_GOVERNED_META_KINDS) {
      const r = resolveEffectiveNotificationPreference({
        metaKind: kind,
        recipientRole: "owner",
        preferences: prefsWithMember({ storeEnabled: false }),
      });
      expect(r.sendPush, kind).toBe(false);
      expect(r.playSound, kind).toBe(false);
    }
  });

  it("store_enabled=true → 기존 판정 유지", () => {
    const r = resolveEffectiveNotificationPreference({
      metaKind: "delivery_ad_approved",
      recipientRole: "owner",
      preferences: prefsWithMember({ storeEnabled: true }),
    });
    expect(r.sendPush).toBe(true);
  });

  it("금융 필수(광고 캐시 충전)는 매장 토글과 무관하게 발송", () => {
    const r = resolveEffectiveNotificationPreference({
      metaKind: "delivery_ad_business_cash_charge_completed",
      recipientRole: "owner",
      preferences: prefsWithMember({ storeEnabled: false }),
    });
    expect(r.sendPush).toBe(true);
  });
});

describe("D-Q4 — 매장 심사·영업 정지 결정과 관리자 주문 개입은 매장 토글로 끌 수 없는 필수 통지", () => {
  for (const kind of ["admin_store_decision", "admin_store_order_intervention"]) {
    it(`${kind}: store_enabled=false 여도 발송`, () => {
      expect(STORE_SETTING_GOVERNED_META_KINDS.has(kind)).toBe(false);
      const r = resolveEffectiveNotificationPreference({
        metaKind: kind,
        recipientRole: "owner",
        preferences: prefsWithMember({ storeEnabled: false }),
      });
      expect(r.mandatory).toBe(true);
      expect(r.sendPush).toBe(true);
    });
  }
});
