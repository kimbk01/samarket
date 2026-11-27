/**
 * 영구 삭제 실패 감사 기록(user_purge_failed)이 관리자 회원 운영 이력에 키 그대로 보이지 않게 (2026-11-27)
 */
import "@/lib/i18n/admin-catalog";
import { describe, expect, it } from "vitest";
import { labelForAction } from "@/lib/admin-users/member-ops-history";
import { translateBy } from "@/lib/i18n/translate-by";

describe("운영 이력 라벨 — 영구 삭제 실패", () => {
  it("user_purge_failed 는 카탈로그 문구로 보인다", () => {
    const label = labelForAction("user_purge_failed", "audit_logs");
    expect(label).toBe(translateBy("ko", "admin_member_ops_user_purge_failed"));
    expect(label).not.toBe("user_purge_failed");
  });
  it("영구 삭제 성공 라벨과 다르다", () => {
    expect(labelForAction("user_purge_failed", "audit_logs")).not.toBe(labelForAction("user_purge", "audit_logs"));
  });
});
