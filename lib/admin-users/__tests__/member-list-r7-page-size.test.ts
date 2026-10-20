/**
 * R7 목록 표준 — 회원 목록 페이지 크기 20/50/100 (예전 10/20/50, 서버 상한 50).
 * 회원 상세 탭(`parseAdminMemberListPage`)은 기존 계약 그대로.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseAdminMemberListPage,
  parseAdminMemberListStandardPage,
} from "@/lib/admin-users/admin-member-list-query";
import { buildMemberListQueryString, parseMemberListQueryState } from "@/lib/admin-users/member-list-presentation";

describe("GET /api/admin/users 페이지 크기", () => {
  it.each([
    [null, 20],
    ["10", 20],
    ["20", 20],
    ["50", 50],
    ["100", 100],
    ["200", 20],
  ])("pageSize=%s → %i", (raw, size) => {
    expect(parseAdminMemberListStandardPage("1", raw).pageSize).toBe(size);
  });

  it("offset = (page-1) × size", () => {
    expect(parseAdminMemberListStandardPage("3", "100")).toEqual({ page: 3, pageSize: 100, from: 200, to: 299 });
  });

  it("라우트는 표준 파서를 쓴다 · 회원 상세 탭 파서는 그대로", () => {
    const route = readFileSync(join(process.cwd(), "app/api/admin/users/route.ts"), "utf8");
    expect(route).toContain("parseAdminMemberListStandardPage(");
    expect(parseAdminMemberListPage(null, null)).toEqual({ page: 1, pageSize: 10, from: 0, to: 9 });
  });

  it("화면 주소: 기본 20 (주소 생략) · 100 은 pageSize=100", () => {
    expect(parseMemberListQueryState(new URLSearchParams("")).pageSize).toBe(20);
    expect(parseMemberListQueryState(new URLSearchParams("pageSize=10")).pageSize).toBe(20);
    const base = {
      search: "",
      status: "" as const,
      verify: "" as const,
      store: "" as const,
      privilege: "" as const,
      origin: "" as const,
      joinedFrom: "",
      joinedTo: "",
      sort: "created_at_desc" as const,
      page: 1,
    };
    expect(buildMemberListQueryString({ ...base, pageSize: 20 })).toBe("");
    expect(buildMemberListQueryString({ ...base, pageSize: 100 })).toBe("pageSize=100");
  });
});
