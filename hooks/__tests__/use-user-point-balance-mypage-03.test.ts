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
    // 최종 설계 H0: 홈 포인트 값 = `/api/me/mypage-summary` pointsBalance, 실패 = "—"
    const src = readFileSync(
      resolve(process.cwd(), "components/mypage/home/MypagePointsAssetSummary.tsx"),
      "utf8"
    );
    expect(src).not.toContain("useUserPointBalance");
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
