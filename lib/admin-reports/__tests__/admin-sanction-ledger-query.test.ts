import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseSanctionLedgerQuery,
  SANCTION_LEDGER_ACTION_TYPES,
} from "@/lib/admin-reports/admin-sanction-ledger-query";

const ROOT = process.cwd();
const sp = (q: string) => new URLSearchParams(q);

describe("parseSanctionLedgerQuery", () => {
  it("기본 — 20건, 필터 없음", () => {
    expect(parseSanctionLedgerQuery(sp(""))).toEqual({
      page: { limit: 20, offset: 0 },
      actionType: null,
      target: null,
      fromIso: null,
      toIso: null,
    });
  });

  it("처리 유형은 허용 목록만, 대상 검색 UUID/닉네임, 기간 PHT→UTC, limit 상한 100", () => {
    expect(SANCTION_LEDGER_ACTION_TYPES).toContain("reject");
    const q = parseSanctionLedgerQuery(sp("action_type=reject&q=nick&from=2026-10-20&limit=1000&offset=20"));
    expect(q).toEqual({
      page: { limit: 100, offset: 20 },
      actionType: "reject",
      target: { kind: "nickname", text: "nick" },
      fromIso: "2026-10-19T16:00:00.000Z",
      toIso: null,
    });
    expect(parseSanctionLedgerQuery(sp("action_type=drop_table")).actionType).toBeNull();
    const id = "6f1c2d3e-0000-4000-8000-000000000001";
    expect(parseSanctionLedgerQuery(sp(`q=${id}`)).target).toEqual({ kind: "id", id });
  });
});

describe("제재 기록 화면 — 브라우저 직접 조회 제거", () => {
  it("페이지는 서버 API 를 쓰고, 브라우저 Supabase 조회 모듈은 없다", () => {
    const page = readFileSync(path.join(ROOT, "components/admin/reports/AdminSanctionLedgerPage.tsx"), "utf8");
    expect(page).toContain("/api/admin/reports/sanction-ledger");
    // RS-02 — 원장 3종 병합 커서 페이지 (번호 페이지 대신 이전·다음)
    expect(page).toContain('qs.set("cursor", cursor)');
    expect(page).toContain("admin-sanction-ledger-partial");
    expect(page).not.toContain("getSupabaseClient");
    expect(existsSync(path.join(ROOT, "lib/admin-reports/getAdminSanctionLedgerFromDb.ts"))).toBe(false);
    const route = readFileSync(path.join(ROOT, "app/api/admin/reports/sanction-ledger/route.ts"), "utf8");
    // 회원·권한 워크스페이스 화면 = 회원 키 (설계 v4 권한 표) — 접근표 `/admin/reports/log` 와 같은 키
    expect(route).toContain('requireAdminPermission("users")');
    expect(route).toContain('count: "exact"');
  });
});
