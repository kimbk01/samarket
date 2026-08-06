import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ADMIN_TRUST_HISTORY_LIMIT,
  ADMIN_TRUST_HISTORY_ORDER_ASCENDING,
  filterAdminTrustHistoryRows,
  normalizeAdminTrustHistoryRow,
} from "@/lib/trust/admin-trust-history";

const root = path.resolve(__dirname, "../../..");

describe("Slice7 admin trust history projection", () => {
  it("fixes history limit and newest-first order", () => {
    expect(ADMIN_TRUST_HISTORY_LIMIT).toBe(50);
    expect(ADMIN_TRUST_HISTORY_ORDER_ASCENDING).toBe(false);
  });

  it("drops rows for other users (isolation)", () => {
    const rows = [
      {
        id: "a",
        user_id: "user-a",
        source_type: "admin_adjust",
        source_id: null,
        delta: 1,
        status: "applied",
        reason: "test",
        created_at: "2026-08-06T00:00:00Z",
      },
      {
        id: "b",
        user_id: "user-b",
        source_type: "review",
        source_id: "x",
        delta: -2,
        status: "applied",
        reason: "leak",
        created_at: "2026-08-06T01:00:00Z",
      },
    ];
    const filtered = filterAdminTrustHistoryRows(rows, "user-a");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("a");
    expect(filtered[0]?.userId).toBe("user-a");
    expect(normalizeAdminTrustHistoryRow(rows[1]!, "user-a")).toBeNull();
  });

  it("GET trust route is admin-gated read-only (no trust_score overwrite)", () => {
    const src = readFileSync(path.join(root, "app/api/admin/users/[id]/trust/route.ts"), "utf8");
    expect(src).toContain("requireAdminPermission");
    expect(src).toContain('"users"');
    expect(src).toContain("reputation_logs");
    expect(src).toContain("ADMIN_TRUST_HISTORY_LIMIT");
    expect(src).toContain("order(\"created_at\"");
    expect(src).not.toContain("applyTrustScoreDelta");
    expect(src).not.toMatch(/\.update\(\s*\{\s*trust_score/);
    expect(src).not.toContain("export async function POST");
    expect(src).not.toContain("export async function PATCH");
  });

  it("Admin detail uses Trust section; adjust still goes through trust-score writer", () => {
    const detail = readFileSync(
      path.join(root, "components/admin/users/AdminTestUserDetail.tsx"),
      "utf8",
    );
    const section = readFileSync(
      path.join(root, "components/admin/users/AdminUserTrustSection.tsx"),
      "utf8",
    );
    expect(detail).toContain("AdminUserTrustSection");
    expect(detail).not.toContain("handleAdjustTrust");
    expect(section).toContain('fetch("/api/admin/trust-score"');
    expect(section).toContain("/trust");
    expect(section).toContain("admin_users_trust_history");
  });

  it("POST trust-score writer authority remains applyTrustScoreDelta only", () => {
    const src = readFileSync(path.join(root, "app/api/admin/trust-score/route.ts"), "utf8");
    expect(src).toContain("applyTrustScoreDelta");
    expect(src).not.toMatch(/\.from\(["']profiles["']\)\.update\(\s*\{\s*trust_score/);
  });
});
