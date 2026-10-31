/**
 * 관리자 고객지원 관제 — 항목 첫 클릭 순간 「오류가 발생했습니다.」 깜박임 (2026-10-31 실기 1-4R 재현, API 200).
 */
import { describe, expect, it } from "vitest";
import { resolveAdminSupportDetailPane } from "@/lib/support/admin-support-detail-pane";

describe("resolveAdminSupportDetailPane", () => {
  it("선택 없음 → 안내", () => {
    expect(resolveAdminSupportDetailPane({ activeId: null, detailLoading: false, hasActiveCase: false, error: null })).toBe("empty");
  });

  it("첫 클릭 직후(요청 시작 전·오류 없음·상세 없음) → 불러오는 중 (이전: 오류 문구)", () => {
    expect(resolveAdminSupportDetailPane({ activeId: "c1", detailLoading: false, hasActiveCase: false, error: null })).toBe("loading");
  });

  it("불러오는 중 → 불러오는 중", () => {
    expect(resolveAdminSupportDetailPane({ activeId: "c1", detailLoading: true, hasActiveCase: false, error: null })).toBe("loading");
  });

  it("실제 오류 값이 있으면 오류 (불러오기 실패는 그대로 보인다)", () => {
    expect(resolveAdminSupportDetailPane({ activeId: "c1", detailLoading: false, hasActiveCase: false, error: "load_failed" })).toBe("error");
    expect(resolveAdminSupportDetailPane({ activeId: "c1", detailLoading: false, hasActiveCase: false, error: "network_error" })).toBe("error");
  });

  it("상세가 있으면 상세 (처리 오류는 상세 안에서 표시)", () => {
    expect(resolveAdminSupportDetailPane({ activeId: "c1", detailLoading: false, hasActiveCase: true, error: "action_failed" })).toBe("detail");
  });
});
