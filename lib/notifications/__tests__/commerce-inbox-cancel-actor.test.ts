/**
 * HARD LOCK 실측 결함 — 구매자 알림함이 취소 주체를 덮어쓰지 않는다 (NTF-02 · ORD-09 · J-1).
 * 시스템 미접수 자동 취소 · 관리자 취소 · 매장 취소 사유 · 배달 동기화 도착 · 주체 meta 없는 이전 알림.
 */
import { describe, expect, it } from "vitest";
import {
  resolveCommerceNotificationInboxBody,
  resolveCommerceNotificationInboxTitle,
} from "@/lib/notifications/resolve-commerce-notification-inbox-text";

const base = { kind: "store_order_owner_status", order_no: "SO1", store_display_name: "가게", order_status: "cancelled" };

describe("buyer commerce inbox — cancel actor preserved", () => {
  it("accept_timeout → 미접수 자동 취소 문구 (not 「매장에 의해 취소」)", () => {
    const body = resolveCommerceNotificationInboxBody("ko", { ...base, cancel_by: "accept_timeout", timeout_minutes: 10 }, "x");
    expect(body).toContain("10분 안에 접수되지 않아 자동 취소");
    expect(body).not.toContain("매장에 의해");
  });

  it("admin → 운영팀 취소 문구", () => {
    const body = resolveCommerceNotificationInboxBody("ko", { ...base, cancel_by: "admin" }, "x");
    expect(body).toContain("DIBAY 운영팀에 의해 취소");
  });

  it("owner with reason → 사유 포함 (J-1)", () => {
    const body = resolveCommerceNotificationInboxBody("ko", { ...base, cancel_by: "owner", cancel_reason: "재료 소진" }, "x");
    expect(body).toContain("매장에 의해 취소");
    expect(body).toContain("사유: 재료 소진");
  });

  it("owner without reason → 기본 매장 취소 문구", () => {
    expect(resolveCommerceNotificationInboxBody("ko", { ...base, cancel_by: "owner" }, "x")).toContain("매장에 의해 취소");
  });

  it("legacy row without cancel_by → stored sentence kept (actor not rewritten)", () => {
    const stored = "「가게」 SO1 주문이 10분 안에 접수되지 않아 자동 취소되었습니다.";
    expect(resolveCommerceNotificationInboxBody("ko", base, stored)).toBe(stored);
  });

  it("delivery_sync arrived → 배달 완료 문구·제목", () => {
    const m = { ...base, order_status: "arrived", system_purpose: "delivery_sync" };
    expect(resolveCommerceNotificationInboxTitle("ko", m, "x", "x")).toBe("배달이 완료됐어요");
    expect(resolveCommerceNotificationInboxBody("ko", m, "x")).toContain("배달이 완료됐어요");
  });

  it("en: accept_timeout copy re-translated in the viewer language", () => {
    const body = resolveCommerceNotificationInboxBody("en", { ...base, cancel_by: "accept_timeout", timeout_minutes: 10 }, "x");
    expect(body).not.toMatch(/cancelled by the store/i);
  });
});
