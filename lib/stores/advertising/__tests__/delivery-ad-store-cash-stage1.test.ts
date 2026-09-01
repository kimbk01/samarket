/**
 * Historical Stage 1 Store Cash migration integrity only.
 * This file does not authorize Store Cash as a current product, reader, or writer.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261201280000_delivery_ads_stage1_store_cash_authority.sql"
  ),
  "utf8"
);

describe("historical Stage 1 Store Cash migration evidence", () => {
  it("preserves spend and refund event evidence", () => {
    expect(migration).toMatch(/'AD_SPEND'/);
    expect(migration).toMatch(/'AD_REFUND'/);
    expect(migration).toContain("delivery_ad_store_cash_spends");
  });

  it("preserves original amount and idempotency evidence", () => {
    expect(migration).toMatch(/final_payable_minor/);
    expect(migration).toMatch(/related_type, related_id/);
    expect(migration).toMatch(/unique_violation/);
    expect(migration).toMatch(/v_spend\.amount_php/);
  });

  it("does not rewrite historical balances into the former ads wallet", () => {
    expect(migration).not.toMatch(/INSERT INTO public\.delivery_ad_accounts/);
    expect(migration).toMatch(/PRESERVED|MIGRATE|Legacy/i);
  });
});
