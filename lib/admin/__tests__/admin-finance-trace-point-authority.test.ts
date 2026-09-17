import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Admin Point adjust — ledger money authority (Admin Trace A)", () => {
  const src = () => read("app/api/admin/points/adjust/route.ts");

  it("T1 — GET preview derives balance from ledger SUM", () => {
    const route = src();
    const getBlock = route.slice(route.indexOf("export async function GET"));
    expect(getBlock).toContain("readCanonicalAdminPointBalance");
    expect(route).toContain("sumUserPointLedger");
    expect(route).not.toContain("readUserPointBalance");
    // Comment may mention profiles.points as non-authority only.
    expect(route).toMatch(/profiles\.points is projection\/cache/i);
  });

  it("T2 — debit sufficiency gate derives balance from ledger SUM", () => {
    const route = src();
    const postBlock = route.slice(
      route.indexOf("export async function POST"),
      route.indexOf("export async function GET")
    );
    expect(postBlock).toContain("readCanonicalAdminPointBalance");
    expect(postBlock).toContain('op === "debit"');
    expect(postBlock).toContain("insufficient_balance");
    expect(postBlock).not.toContain("readUserPointBalance");
    // Helper itself is ledger-only.
    expect(route).toMatch(
      /async function readCanonicalAdminPointBalance[\s\S]*sumUserPointLedger/
    );
  });

  it("T3 — writer remains canonical adjustUserPoints", () => {
    const route = src();
    expect(route).toContain("adjustUserPoints");
    const ledger = read("lib/points/user-point-ledger.ts");
    expect(ledger).toContain("export async function adjustUserPoints");
    expect(ledger).toMatch(/admin_credit|admin_debit/);
  });

  it("stale-projection contract — Admin must choose ledger SUM over profiles.points", () => {
    const route = src();
    const helper = route.slice(
      route.indexOf("async function readCanonicalAdminPointBalance"),
      route.indexOf("export async function POST")
    );
    expect(helper).toContain("sumUserPointLedger");
    expect(helper).not.toContain("profiles");
    expect(helper).not.toContain("readUserPointBalance");
    // Both consumers share the ledger helper.
    expect(route.match(/readCanonicalAdminPointBalance/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("F-07 projection write lock preserved — adjust route does not write profiles.points", () => {
    const route = src();
    expect(route).not.toMatch(/\.from\(\s*["']profiles["']\s*\)/);
    expect(route).not.toMatch(/points\s*:/);
    const mig = read(
      "supabase/migrations/20270118150000_finance_f07_point_projection_write_lock.sql"
    );
    expect(mig.length).toBeGreaterThan(100);
  });

  it("Admin Coin balance display does not clamp negatives (carry)", () => {
    const panels = read("components/admin/finance/AdminStoreFinancePanels.tsx");
    expect(panels).toContain("(data?.coin?.balance ?? 0).toLocaleString()");
    expect(panels).not.toMatch(/Math\.max\(0,\s*data\?\.coin\?\.balance/);
  });
});
