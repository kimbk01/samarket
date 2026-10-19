import { describe, expect, it } from "vitest";
import {
  isAdminConflictErrorCode,
  readExpectedUpdatedAt,
  sameUpdatedAtInstant,
} from "@/lib/admin/concurrency/admin-expected-updated-at";
import {
  adminConflictReloadedCode,
  adminConflictReloadedMessage,
  adminOperatorErrorMessage,
} from "@/lib/admin/operator-ux/operator-labels";

describe("admin expected_updated_at helpers", () => {
  it("reads only non-empty strings", () => {
    expect(readExpectedUpdatedAt(" 2026-10-19T00:00:00Z ")).toBe("2026-10-19T00:00:00Z");
    expect(readExpectedUpdatedAt("")).toBeNull();
    expect(readExpectedUpdatedAt(null)).toBeNull();
    expect(readExpectedUpdatedAt(123)).toBeNull();
  });

  it("compares instants across Z / +00:00 and fractional digits", () => {
    expect(sameUpdatedAtInstant("2026-10-19T01:02:03.123Z", "2026-10-19T01:02:03.123+00:00")).toBe(true);
    expect(sameUpdatedAtInstant("2026-10-19T01:02:03.123456+00:00", "2026-10-19T01:02:03.123456+00:00")).toBe(true);
    // 마이크로초 차이도 다른 버전으로 본다 (Date.parse 는 밀리초에서 잘림).
    expect(sameUpdatedAtInstant("2026-10-19T01:02:03.123456+00:00", "2026-10-19T01:02:03.123457+00:00")).toBe(false);
    expect(sameUpdatedAtInstant("2026-10-19T01:02:03Z", "2026-10-19T01:02:04Z")).toBe(false);
    expect(sameUpdatedAtInstant(null, null)).toBe(true);
    expect(sameUpdatedAtInstant("2026-10-19T01:02:03Z", null)).toBe(false);
  });

  it("conflict codes and Korean messages", () => {
    expect(isAdminConflictErrorCode("stale_updated_at")).toBe(true);
    expect(isAdminConflictErrorCode("stale_policy")).toBe(true);
    expect(isAdminConflictErrorCode("update_failed")).toBe(false);
    expect(adminConflictReloadedCode("stale_policy")).toBe("stale_reloaded");
    expect(adminConflictReloadedCode("forbidden")).toBe("forbidden");
    expect(adminConflictReloadedMessage("stale_updated_at", true)).toContain("다른 관리자가 먼저 수정");
    expect(adminConflictReloadedMessage("stale_updated_at", true)).toContain("최신 내용을 다시 불러왔");
    expect(adminOperatorErrorMessage("stale_policy", true)).toContain("수수료 정책");
    expect(adminOperatorErrorMessage("expected_updated_at_required", true)).toContain("새로고침");
  });
});
