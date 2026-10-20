import { describe, expect, it } from "vitest";
import {
  ADMIN_STATUS_TONE_TO_BADGE,
  adminStatusLabelText,
  listAdminStatusCodes,
  lookupAdminStatusLabel,
  registerAdminStatusLabels,
} from "@/lib/admin/status-labels/admin-status-label-registry";

describe("admin status label registry", () => {
  it("common 시드 10종", () => {
    expect(listAdminStatusCodes("common")).toEqual([
      "pending",
      "in_progress",
      "completed",
      "failed",
      "cancelled",
      "rejected",
      "approved",
      "on_hold",
      "active",
      "inactive",
    ]);
    expect(lookupAdminStatusLabel("common", "completed")).toMatchObject({ ko: "완료", tone: "success", known: true });
    expect(lookupAdminStatusLabel("common", "ON_HOLD")).toMatchObject({ ko: "보류", tone: "warning", code: "ON_HOLD" });
  });

  it("미등록 = 「알 수 없는 상태」, 빈 값 = 「—」", () => {
    expect(lookupAdminStatusLabel("common", "zzz")).toMatchObject({
      ko: "알 수 없는 상태",
      en: "Unknown status",
      tone: "neutral",
      known: false,
      code: "zzz",
      namespace: null,
    });
    expect(lookupAdminStatusLabel("common", "")).toMatchObject({ ko: "—", known: false });
    expect(lookupAdminStatusLabel("common", null).known).toBe(false);
  });

  it("도메인 등록 · common 대체 조회", () => {
    registerAdminStatusLabels("test_domain", { shipped: { ko: "발송", en: "Shipped", tone: "info" } });
    expect(lookupAdminStatusLabel("test_domain", "shipped")).toMatchObject({ ko: "발송", namespace: "test_domain" });
    expect(lookupAdminStatusLabel("test_domain", "failed")).toMatchObject({ ko: "실패", namespace: "common" });
    expect(lookupAdminStatusLabel("test_domain", "failed", { fallbackToCommon: false }).known).toBe(false);
    expect(adminStatusLabelText("test_domain", "shipped", false)).toBe("Shipped");
  });

  it("같은 코드 다른 내용 재등록 = 오류, 같은 내용은 무시", () => {
    registerAdminStatusLabels("test_conflict", { a: { ko: "가", en: "A", tone: "neutral" } });
    expect(() => registerAdminStatusLabels("test_conflict", { a: { ko: "가", en: "A", tone: "neutral" } })).not.toThrow();
    expect(() => registerAdminStatusLabels("test_conflict", { A: { ko: "나", en: "A", tone: "neutral" } })).toThrow(/conflict/);
  });

  it("톤 → AdminToneBadge 톤 (info = progress)", () => {
    expect(ADMIN_STATUS_TONE_TO_BADGE).toEqual({
      neutral: "neutral",
      info: "progress",
      success: "success",
      warning: "warning",
      danger: "danger",
    });
  });
});
