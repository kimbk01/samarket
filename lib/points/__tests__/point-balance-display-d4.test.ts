import { beforeEach, describe, expect, it, vi } from "vitest";
import { readUserPointBalance, readUserPointBalanceResult } from "@/lib/points/user-point-ledger";
import { loadPointFinancialSummary } from "@/lib/points/project-point-financial-history";

/**
 * D4 — 음수 포인트는 실제 값, 조회 실패·미조회는 0 이 아니라 "확인 불가".
 * 근거: dibay-community-dpoint-financial-hard-lock §6 F-13·F-14, §8 "0-clamp 금지", 관리자 Gate B "error ≠ zero".
 */

type Res = { data: unknown; error: { message: string } | null };
let profilesRes: Res;
let ledgerRows: unknown[];
let serviceAvailable: boolean;

function fakeSb() {
  return {
    rpc: async () => ({ data: (ledgerRows as Array<{ amount: number }>).reduce((a, r) => a + r.amount, 0), error: null }),
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit", "gt", "lt", "not", "is", "in", "or", "gte", "lte"]) {
        q[m] = () => q;
      }
      q.maybeSingle = async () => (table === "profiles" ? profilesRes : { data: null, error: null });
      q.then = (resolve: (v: Res) => unknown) =>
        resolve(table === "point_ledger" ? { data: ledgerRows, error: null } : { data: [], error: null });
      return q;
    },
  };
}

vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: async () => ({ ok: true, userId: "u1" }),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => (serviceAvailable ? fakeSb() : null),
}));

async function getMePoints() {
  const { GET } = await import("@/app/api/me/points/route");
  const { NextRequest } = await import("next/server");
  const res = await GET(new NextRequest("http://localhost/api/me/points"));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("D4 point balance display", () => {
  beforeEach(() => {
    serviceAvailable = true;
    profilesRes = { data: { points: -38, nickname: "n" }, error: null };
    ledgerRows = [
      { id: "l1", amount: 5, created_at: "2026-09-01T00:00:00Z" },
      { id: "l2", amount: -43, created_at: "2026-09-12T00:00:00Z" },
    ];
  });

  it("잔액 읽기: 음수 그대로, 실패는 ok:false (0 아님)", async () => {
    expect(await readUserPointBalanceResult(fakeSb() as never, "u1")).toEqual({ ok: true, balance: -38 });
    profilesRes = { data: null, error: { message: "db down" } };
    expect(await readUserPointBalanceResult(fakeSb() as never, "u1")).toEqual({ ok: false, error: "db down" });
  });

  it("원장 쓰기 경로용 readUserPointBalance 는 기존 동작(실패 시 0) 유지", async () => {
    profilesRes = { data: null, error: { message: "db down" } };
    expect(await readUserPointBalance(fakeSb() as never, "u1")).toBe(0);
  });

  it("요약: 음수 잔액·원장 합 일치, 잔액 실패 시 ok:false", async () => {
    const ok = await loadPointFinancialSummary(fakeSb() as never, "u1");
    expect(ok.ok && ok.summary.balance).toBe(-38);
    expect(ok.ok && ok.summary.cacheMatchesLedger).toBe(true);
    profilesRes = { data: null, error: { message: "db down" } };
    expect((await loadPointFinancialSummary(fakeSb() as never, "u1")).ok).toBe(false);
  });

  it("GET /api/me/points: 음수 잔액 200 그대로", async () => {
    const r = await getMePoints();
    expect(r.status).toBe(200);
    expect(r.json.balance).toBe(-38);
  });

  it("GET /api/me/points: 잔액 조회 실패 → 503 (0 성공 응답 금지)", async () => {
    profilesRes = { data: null, error: { message: "db down" } };
    const r = await getMePoints();
    expect(r.status).toBe(503);
    expect(r.json.ok).toBe(false);
    expect(r.json).not.toHaveProperty("balance");
  });

  it("GET /api/me/points: 서버 설정 없음 → 503 (기존: balance 0 성공 응답)", async () => {
    serviceAvailable = false;
    const r = await getMePoints();
    expect(r.status).toBe(503);
    expect(r.json).not.toHaveProperty("balance");
  });
});

describe("D4 화면 계약 — 0 으로 자르기 재발 방지", () => {
  it("잔액 훅·포인트 화면에 Math.max(0, …) 클램프 없음, 화면 기본값은 null(확인 전)", async () => {
    const { readFileSync } = await import("node:fs");
    const hook = readFileSync("hooks/useUserPointBalance.ts", "utf8");
    const page = readFileSync("app/(main)/mypage/points/page.tsx", "utf8");
    expect(hook).not.toMatch(/Math\.max\(\s*0\s*,/);
    expect(page).not.toMatch(/Math\.max\(\s*0\s*,/);
    expect(page).toContain("useState<number | null>(null)");
    expect(page).not.toContain("setBalance(0)");
  });
});
