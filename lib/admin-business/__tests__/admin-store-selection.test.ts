import { describe, expect, it } from "vitest";
import {
  EMPTY_ADMIN_STORE_SELECTION,
  isPageFullySelected,
  onFilterChangeAdminStoreSelection,
  removeFromAdminStoreSelection,
  selectAllResultsAdminStoreSelection,
  toggleAdminStoreSelection,
  togglePageAdminStoreSelection,
} from "@/lib/admin-business/admin-store-selection";

describe("3-C L-10 admin store selection", () => {
  it("페이지를 옮겨도 선택이 유지된다 (id 집합)", () => {
    let s = togglePageAdminStoreSelection(EMPTY_ADMIN_STORE_SELECTION, ["a", "b"]);
    // 2쪽으로 이동 — 다른 행 선택
    s = toggleAdminStoreSelection(s, "c");
    expect(s.ids).toEqual(["a", "b", "c"]);
    // 1쪽으로 돌아오면 여전히 전체 선택 상태
    expect(isPageFullySelected(s, ["a", "b"])).toBe(true);
    // 1쪽 해제는 2쪽 선택을 지우지 않는다
    s = togglePageAdminStoreSelection(s, ["a", "b"]);
    expect(s.ids).toEqual(["c"]);
  });

  it("현재 페이지 선택과 전체 결과 선택을 구분한다", () => {
    const page = togglePageAdminStoreSelection(EMPTY_ADMIN_STORE_SELECTION, ["a"]);
    expect(page.scope).toBe("manual");
    const all = selectAllResultsAdminStoreSelection({ ids: ["a", "b", "b", "c"], total: 3, filterKey: "k1" });
    expect(all.scope).toBe("all_results");
    expect(all.ids).toEqual(["a", "b", "c"]);
    expect(all.allResultsTotal).toBe(3);
    // 하나라도 직접 바꾸면 manual
    expect(toggleAdminStoreSelection(all, "a").scope).toBe("manual");
  });

  it("필터가 바뀌면 전체 결과 표시만 풀고 id 는 유지, 같은 필터면 그대로", () => {
    const all = selectAllResultsAdminStoreSelection({ ids: ["a"], total: 1, filterKey: "k1" });
    expect(onFilterChangeAdminStoreSelection(all, "k1")).toBe(all);
    const changed = onFilterChangeAdminStoreSelection(all, "k2");
    expect(changed.scope).toBe("manual");
    expect(changed.ids).toEqual(["a"]);
  });

  it("처리 성공 id 는 선택에서 빠진다", () => {
    const s = removeFromAdminStoreSelection({ ...EMPTY_ADMIN_STORE_SELECTION, ids: ["a", "b"] }, ["a"]);
    expect(s.ids).toEqual(["b"]);
  });
});
