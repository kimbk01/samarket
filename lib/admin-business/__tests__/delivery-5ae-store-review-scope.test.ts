import { describe, expect, it } from "vitest";
import {
  ADMIN_STORE_REVIEW_DECISION_AUDIT_ACTIONS,
  adminStoresSortOrder,
  applyAdminStoresReviewScope,
  parseAdminStoresReviewScope,
  parseAdminStoresSort,
  pickLatestStoreReviewDecisions,
} from "@/lib/admin-business/admin-stores-list-query";

/** 5-E — 입점 심사 범위: 샘플 제외(쿼리 단계) · 정렬 · 처리자/처리일(감사 기록 최신 1건). */
describe("5-E 입점 심사 범위", () => {
  it("scope=review 일 때만 store_kind != sample 조건을 붙인다", () => {
    const calls: [string, string][] = [];
    const q = {
      neq(col: string, val: string) {
        calls.push([col, val]);
        return q;
      },
    };
    expect(parseAdminStoresReviewScope(new URLSearchParams("scope=review"))).toBe(true);
    expect(parseAdminStoresReviewScope(new URLSearchParams("page=1"))).toBe(false);
    applyAdminStoresReviewScope(q, false);
    expect(calls).toEqual([]);
    applyAdminStoresReviewScope(q, true);
    expect(calls).toEqual([["store_kind", "sample"]]);
  });

  it("정렬 해석 — 기본 신청일 최신순, 상태 정렬은 상태 → 신청일", () => {
    expect(parseAdminStoresSort(new URLSearchParams(""))).toBe("created_desc");
    expect(parseAdminStoresSort(new URLSearchParams("sort=evil"))).toBe("created_desc");
    expect(adminStoresSortOrder("created_asc")).toEqual([{ column: "created_at", ascending: true }]);
    expect(adminStoresSortOrder(parseAdminStoresSort(new URLSearchParams("sort=status")))).toEqual([
      { column: "approval_status", ascending: true },
      { column: "created_at", ascending: false },
    ]);
  });

  it("처리자/처리일 = 심사 결정 감사 기록 중 매장별 최신 1건 (운영 조치는 제외)", () => {
    const m = pickLatestStoreReviewDecisions([
      { target_id: "s1", actor_id: "a1", action: "store.start_review", created_at: "2026-10-01T00:00:00Z" },
      { target_id: "s1", actor_id: "a2", action: "store.approve_store", created_at: "2026-10-02T00:00:00.5Z" },
      { target_id: "s1", actor_id: "a3", action: "store.suspend_store", created_at: "2026-10-03T00:00:00Z" },
      { target_id: "s2", actor_id: null, action: "store.reject_store", created_at: "2026-10-01T00:00:00Z" },
    ]);
    expect(m.get("s1")).toEqual({ actorId: "a2", action: "store.approve_store", at: "2026-10-02T00:00:00.5Z" });
    expect(m.get("s2")).toEqual({ actorId: null, action: "store.reject_store", at: "2026-10-01T00:00:00Z" });
    expect(ADMIN_STORE_REVIEW_DECISION_AUDIT_ACTIONS).not.toContain("store.suspend_store");
  });
});
