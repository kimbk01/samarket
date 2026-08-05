import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Phase 4 Slice 2 ledger-only contract", () => {
  it("hub documents project-only cache write", () => {
    const hub = readFileSync(resolve(process.cwd(), "lib/points/user-point-ledger.ts"), "utf8");
    expect(hub).toContain("projectUserPointBalanceFromLedger");
    expect(hub).toContain("sumUserPointLedger");
    expect(hub).toContain("reconcileUserPointBalance");
    const updates = hub.match(/\.from\("profiles"\)\.update\(\{\s*points:/g) ?? [];
    expect(updates.length).toBe(1);
  });

  it("trade-ads and admin PATCH do not update profiles.points directly", () => {
    const files = [
      "lib/trade-ads/trade-post-ad-point-flow.ts",
      "lib/trade-ads/charge-trade-post-ad-points.ts",
      "app/api/admin/users/[id]/points/route.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      expect(src).not.toMatch(/\.from\("profiles"\)\.update\(\{\s*points:/);
    }
  });

  it("migration defines project + ledger-only charge approve", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20261018150000_member_point_ledger_only_project.sql"
      ),
      "utf8"
    );
    expect(sql).toContain("sum_user_point_ledger");
    expect(sql).toContain("project_user_point_balance_from_ledger");
    expect(sql).toContain("approve_user_point_charge_request");
    expect(sql).toContain("project_user_point_balance_from_ledger(v_req.user_id)");
  });
});
