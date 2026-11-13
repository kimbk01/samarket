import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isAdminMemberUuidSearch } from "@/lib/admin-users/admin-member-list-query";

const route = readFileSync(path.join(process.cwd(), "app/api/admin/users/route.ts"), "utf8");

describe("어드민 회원 검색 — 매장 id 조회는 uuid 검색어만 (운영 uuid 오류 11-08~13)", () => {
  it("아이디·숫자 검색어는 uuid 검색이 아니다", () => {
    expect(isAdminMemberUuidSearch("sin")).toBe(false);
    expect(isAdminMemberUuidSearch("sinjinkim00")).toBe(false);
    expect(isAdminMemberUuidSearch("5823")).toBe(false);
    expect(isAdminMemberUuidSearch("026d4971-a6f4-428e-81d2-4efe2c7014e7")).toBe(true);
  });

  it("stores.id 비교는 uuidSearch 조건 안에서만 한다", () => {
    const idx = route.indexOf('.eq("id", search)');
    expect(idx).toBeGreaterThan(0);
    const before = route.slice(Math.max(0, idx - 400), idx);
    expect(before).toMatch(/uuidSearch\s*\n\s*\?\s*supabase\s*\n\s*\.from\("stores"\)/);
  });
});
