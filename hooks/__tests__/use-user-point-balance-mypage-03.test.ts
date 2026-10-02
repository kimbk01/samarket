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

  it("mypage home summary branches on error before rendering amount", () => {
    const src = readFileSync(
      resolve(process.cwd(), "components/mypage/home/MypagePointsAssetSummary.tsx"),
      "utf8"
    );
    expect(src).toContain("mypage_points_balance_load_failed");
    const errIdx = src.indexOf("error ?");
    const amountIdx = src.indexOf("amount={balance}");
    expect(errIdx).toBeGreaterThan(-1);
    expect(amountIdx).toBeGreaterThan(errIdx);
  });
});
