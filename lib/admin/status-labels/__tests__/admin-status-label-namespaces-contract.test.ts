/**
 * 상태 라벨 네임스페이스 계약 (수정 계획 2-4 · 재설계 R5) — 계획의 9개 도메인이 모두 라벨·톤을 가진다.
 * 회원 · 신고 · 광고 · 팝업 · 결제 · 포인트 · 매장 주문 · 배달 광고 · 채팅방.
 */
import { describe, expect, it } from "vitest";
import { listAdminStatusCodes, lookupAdminStatusLabel } from "@/lib/admin/status-labels/admin-status-label-registry";
import "@/lib/admin/status-labels/ads-status-labels";
import { MEMBERS_REPORT_STATUS_NS } from "@/lib/admin/status-labels/members-status-labels";
import { FINANCE_PAYMENT_STATUS_NS, MEMBERS_ACCOUNT_STATUS_NS } from "@/lib/admin/status-labels/r5-members-finance-status-labels";
import { POINTS_CHARGE_STATUS_NS } from "@/lib/admin/status-labels/r5-points-status-labels";
import { PLATFORM_POPUP_STATUS_NS } from "@/lib/admin/status-labels/r5-platform-status-labels";
import {
  DELIVERY_AD_STATUS_NAMESPACE,
  DELIVERY_STORE_ORDER_STATUS_NAMESPACE,
} from "@/lib/admin/status-labels/r5-delivery-status-labels";
import { adminChatLabel, adminChatLabelCodes } from "@/lib/admin/status-labels/chat-status-labels";

const PLAN_NAMESPACES: Record<string, string> = {
  회원: MEMBERS_ACCOUNT_STATUS_NS,
  신고: MEMBERS_REPORT_STATUS_NS,
  광고: "ads.domain",
  팝업: PLATFORM_POPUP_STATUS_NS,
  결제: FINANCE_PAYMENT_STATUS_NS,
  포인트: POINTS_CHARGE_STATUS_NS,
  "매장 주문": DELIVERY_STORE_ORDER_STATUS_NAMESPACE,
  "배달 광고": DELIVERY_AD_STATUS_NAMESPACE,
};

describe("상태 라벨 네임스페이스 (계획 2-4)", () => {
  for (const [domain, ns] of Object.entries(PLAN_NAMESPACES)) {
    it(`${domain} (${ns}) — 코드마다 한글 라벨과 톤`, () => {
      const codes = listAdminStatusCodes(ns);
      expect(codes.length, ns).toBeGreaterThan(1);
      for (const code of codes) {
        const label = lookupAdminStatusLabel(ns, code);
        expect(label.ko.trim().length, `${ns}.${code}`).toBeGreaterThan(0);
        expect(label.ko, `${ns}.${code}`).not.toBe(code);
        expect(["neutral", "info", "success", "warning", "danger", "waiting", "progress"]).toContain(label.tone);
      }
    });
  }

  it("채팅방 — chat-status-labels 의 방 상태", () => {
    expect(adminChatLabelCodes("room_status").length).toBeGreaterThan(1);
  });

  it("통화 종료 사유 — 운영 DB 값(`:` 앞 코드)이 한글 라벨, 모르는 값은 원문 대신 「알 수 없음」", () => {
    for (const code of ["canceled", "ended", "missed", "declined", "ended_by_callee", "failed_signaling", "admin_force_end"]) {
      const r = adminChatLabel("call_ended_reason", code, true);
      expect(r.known, code).toBe(true);
      expect(r.label).not.toBe(code);
    }
    expect(adminChatLabel("call_ended_reason", "weird_reason", true).label).not.toContain("weird_reason");
  });

  it("모르는 값은 원문이 아니라 「알 수 없는 상태」", () => {
    const r = lookupAdminStatusLabel(PLATFORM_POPUP_STATUS_NS, "SOME_RAW_ENUM");
    expect(r.ko).not.toContain("SOME_RAW_ENUM");
  });
});
