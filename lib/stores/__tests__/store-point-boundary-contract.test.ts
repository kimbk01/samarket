import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  STORE_POINT_CHARGE_PAYMENT_RATIO,
  computeStorePointChargePaymentAmount,
} from "@/lib/stores/store-point-charge-amount";

function walkTsFiles(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next" || name === "dist") continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkTsFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.includes(".test.")) out.push(p);
  }
  return out;
}

describe("store-point-boundary-contract (Phase 4 Slice 4)", () => {
  it("ratio SSOT is local const 1", () => {
    expect(STORE_POINT_CHARGE_PAYMENT_RATIO).toBe(1);
    expect(computeStorePointChargePaymentAmount(1500)).toBe(1500);
  });

  it("charge create uses computeStorePointChargePaymentAmount", () => {
    const src = readFileSync(
      resolve(process.cwd(), "app/api/me/stores/[storeId]/point-charges/route.ts"),
      "utf8"
    );
    expect(src).toContain("computeStorePointChargePaymentAmount");
    expect(src).toMatch(/payment_amount/);
    expect(src).toMatch(/point_amount/);
  });

  it("no TS direct UPDATE of stores.point_balance", () => {
    const roots = ["app", "lib", "components", "services"].map((d) =>
      resolve(process.cwd(), d)
    );
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of walkTsFiles(root)) {
        const text = readFileSync(file, "utf8");
        if (/from\(\s*["']stores["']\s*\)[\s\S]{0,120}\.update\(\s*\{[^}]*point_balance/.test(text)) {
          hits.push(file);
        }
        if (/\.update\(\s*\{\s*point_balance\s*:/.test(text) && text.includes('"stores"')) {
          hits.push(file);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("approve RPC uses v_req.point_amount only (no point_plans)", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260910120000_fix_security_lints.sql"),
      "utf8"
    );
    const fnStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.approve_store_point_charge_request");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = sql.slice(fnStart, fnStart + 2500);
    expect(fnBody).toContain("v_req.point_amount");
    expect(fnBody).not.toMatch(/point_plans|STORE_POINT_CHARGE_PAYMENT_RATIO/i);
  });

  it("Member↔Store transfer symbols ABSENT", () => {
    const roots = ["app", "lib"].map((d) => resolve(process.cwd(), d));
    const bad: string[] = [];
    const patterns = [
      /transfer.*(member|user).*store.*point/i,
      /transfer.*(store).*member.*point/i,
      /member_to_store_point|store_to_member_point/i,
      /transferUserPointsToStore|transferStorePointsToUser/i,
    ];
    for (const root of roots) {
      for (const file of walkTsFiles(root)) {
        const text = readFileSync(file, "utf8");
        if (patterns.some((re) => re.test(text))) bad.push(file);
      }
    }
    expect(bad).toEqual([]);
  });

  it("notify deep links: Store owner points vs Member /mypage/points", () => {
    const storeNotify = readFileSync(
      resolve(process.cwd(), "lib/notifications/notify-store-points.ts"),
      "utf8"
    );
    const memberNotify = readFileSync(
      resolve(process.cwd(), "lib/notifications/notify-user-points.ts"),
      "utf8"
    );
    expect(storeNotify).toContain("OwnerRoutes.points");
    expect(storeNotify).not.toContain('"/mypage/points"');
    expect(memberNotify).toContain('link_url: "/mypage/points"');
  });

  it("Store charge amount module does not import Member rates hub", () => {
    const src = readFileSync(
      resolve(process.cwd(), "lib/stores/store-point-charge-amount.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/from\s+["']@\/lib\/points\//);
    expect(src).not.toMatch(/import\s+.*user-point-ledger|import\s+.*member-point-plans|import\s+.*point-plan-shared/);
  });

  it("adjust and approve admin routes call Store RPCs only", () => {
    const adjust = readFileSync(
      resolve(process.cwd(), "app/api/admin/store-points/[storeId]/adjust/route.ts"),
      "utf8"
    );
    const approve = readFileSync(
      resolve(process.cwd(), "app/api/admin/store-point-charges/[id]/route.ts"),
      "utf8"
    );
    expect(adjust).toContain('rpc("adjust_store_point_balance"');
    expect(approve).toContain('rpc("approve_store_point_charge_request"');
    expect(adjust).not.toMatch(/from\("stores"\)\.update/);
    expect(approve).not.toMatch(/from\("stores"\)\.update/);
  });
});
