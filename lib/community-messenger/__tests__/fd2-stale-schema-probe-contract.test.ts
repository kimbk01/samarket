/**
 * FD2: Product code must not intentionally query known-missing Production columns.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SERVICE = join(process.cwd(), "lib/community-messenger/service.ts");
const SUBTREE = join(process.cwd(), "lib/market/trade-category-subtree.ts");
const ADMIN_STORES = join(process.cwd(), "app/api/admin/stores/route.ts");

describe("FD2 product schema probe elimination", () => {
  it("TRADE_CHAT_LIST candidates exclude currency and category_id", () => {
    const src = readFileSync(SERVICE, "utf8");
    const start = src.indexOf("const TRADE_CHAT_LIST_POST_SELECT_CANDIDATES");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("];", start);
    const block = src.slice(start, end + 2);
    expect(block).toContain("TRADE_CHAT_LIST_POST_SELECT");
    expect(block).not.toMatch(/WITH_CURRENCY/);
    expect(block).not.toMatch(/EXTENDED/);
    // Ensure the candidate string constants that still mention missing cols
    // are not referenced inside the runtime array.
    expect(block).not.toContain("currency");
    expect(block).not.toContain("category_id");
  });

  it("trade_categories legacy merge defaults OFF (no parent_id probe)", () => {
    const src = readFileSync(SUBTREE, "utf8");
    expect(src).toMatch(/return v === "1" \|\| v === "true"/);
    expect(src).toMatch(/typeof process === "undefined"\) return false/);
    // Default path must not query parent_id unless opt-in
    expect(src).toContain("mergeLegacyTradeCategoriesEnabled()");
  });

  it("admin stores GET never selects applicant_nickname", () => {
    const src = readFileSync(ADMIN_STORES, "utf8");
    const start = src.indexOf("const selectAttempts");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("] as const;", start);
    const block = src.slice(start, end);
    expect(block).not.toContain("applicant_nickname");
  });
});
