import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");

describe("admin transaction-reviews read SSOT", () => {
  it("list SELECT omits missing is_hidden_by_admin column", () => {
    const src = readFileSync(
      path.join(ROOT, "app/api/admin/transaction-reviews/route.ts"),
      "utf8"
    );
    expect(src).toContain("SELECT_FIELDS");
    expect(src).not.toMatch(/SELECT_FIELDS\s*=\s*"[^"]*is_hidden_by_admin/);
  });

  it("action route does not hard-fail when is_hidden_by_admin column is absent", () => {
    const src = readFileSync(
      path.join(ROOT, "app/api/admin/transaction-reviews/[id]/action/route.ts"),
      "utf8"
    );
    expect(src).toMatch(/is_hidden_by_admin\|column\|42703/);
    expect(src).toContain('.select("id, reviewee_id")');
  });
});
