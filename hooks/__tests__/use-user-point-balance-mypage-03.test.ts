import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("MYPAGE-03 points fetch error ≠ zero balance", () => {
  it("hook does not setBalance(0) on catch; exposes error", () => {
    const src = readFileSync(resolve(process.cwd(), "hooks/useUserPointBalance.ts"), "utf8");
    expect(src).toContain("error: boolean");
    expect(src).toContain("setError(true)");
    expect(src).not.toMatch(/catch\s*\{\s*setBalance\(0\)/);
  });

  it("mypage home points value: failure = \"—\" (never 0), from summary — not a second points fetch", async () => {
    // 홈 포인트 값 = `/api/me/mypage-summary` pointsBalance, 실패 = "—" (분류 허브 「진행 중」 칸, 2026-11-02)
    const src = readFileSync(
      resolve(process.cwd(), "components/mypage/myinfo/MyInfoHomeCategoryHub.tsx"),
      "utf8"
    );
    expect(src).not.toContain("useUserPointBalance");
    expect(src).toContain("readMypageSummaryValue(f?.pointsBalance)");
    expect(src).toContain('points == null ? dash');
    const { resolveMypageHomePointsValue } = await import("@/lib/mypage/mypage-home-row-values");
    const base = { viewerId: "u1", fetchedAt: 1, loading: false, failed: false };
    expect(
      resolveMypageHomePointsValue({ ...base, fields: { pointsBalance: { status: "unavailable" } } as never })
    ).toEqual({ kind: "unknown" });
    expect(resolveMypageHomePointsValue({ ...base, fields: null, failed: true })).toEqual({ kind: "unknown" });
    expect(
      resolveMypageHomePointsValue({ ...base, fields: { pointsBalance: { status: "ok", value: 0 } } as never })
    ).toEqual({ kind: "amount", amount: 0 });
  });
});
