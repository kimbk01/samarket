/**
 * 관리자 회원 목록 상단 칩 — `null` 은 「그 조건 없이」(실기 2026-11-25: 관리자로 거르면 「전체 회원」=5·「매장 운영」=0 으로 바뀜)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adminMemberPrivilegeFilterPlan, adminMemberStoreFilterPlan } from "@/lib/admin-users/admin-member-list-query";

const route = readFileSync(resolve(process.cwd(), "app/api/admin/users/route.ts"), "utf8");

describe("요약 칩 조건 해석", () => {
  it("매장·관리 권한도 `=== undefined` 일 때만 화면 필터를 쓴다 (`??` 금지)", () => {
    expect(route).not.toMatch(/opts\?\.store \?\? storeFilter/);
    expect(route).not.toMatch(/opts\?\.privilege \?\? privilegeFilter/);
    expect(route).toContain("opts?.store === undefined ? storeFilter : opts.store");
    expect(route).toContain("opts?.privilege === undefined ? privilegeFilter : opts.privilege");
  });
  it("전체·매장 운영·관리자 칩은 매장·관리 권한을 null(조건 없음)로 넘긴다", () => {
    expect(route).toContain('runCount(includeAuthLoginEmail, { store: null, privilege: null, status: null, verify: null, origin: null })');
    expect(route).toContain('runCount(includeAuthLoginEmail, { store: "has_store", privilege: null, status: null, verify: null, origin: null })');
    expect(route).toContain('runCount(includeAuthLoginEmail, { privilege: "admin", store: null, status: null, verify: null, origin: null })');
  });
  it("null 이면 조건 없음", () => {
    expect(adminMemberStoreFilterPlan(null, ["a"])).toEqual({ empty: false, ops: [] });
    expect(adminMemberPrivilegeFilterPlan(null, ["a"])).toEqual({ empty: false, ops: [] });
  });
});
