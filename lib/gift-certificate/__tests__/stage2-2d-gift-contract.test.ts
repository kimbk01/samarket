import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkoutGiftChoiceNeedsForfeitConsent,
  computeCheckoutGiftApplyPreview,
} from "@/lib/gift-certificate/checkout-eligible-gifts";

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

/** SQL without `--` comment lines (rollback notes live in comments). */
function sqlCode(sql: string): string {
  return sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");
}

function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const open = sql.indexOf("$function$", start);
  const close = sql.indexOf("$function$", open + 10);
  return sql.slice(open + 10, close);
}

const REVERSE_MIG = "supabase/migrations/20270603140000_gift_redemption_reverse_terminal_guard.sql";
const PURCHASE_MIG = "supabase/migrations/20270603140100_gift_purchase_idempotency_buyer_scope.sql";
const INTEGRITY_MIG = "supabase/migrations/20270603140200_gift_issued_count_integrity_report.sql";

describe("stage 2-D gift certificate", () => {
  it("GFT-01: reverse locks the order and refuses non-terminal orders before touching redemptions", () => {
    const sql = source(REVERSE_MIG);
    const body = functionBody(sql, "gift_certificate_redemption_reverse");
    const guard = body.indexOf("FROM public.store_orders so");
    const loop = body.indexOf("FOR v_red IN");
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(loop);
    expect(body.slice(guard, loop)).toContain("FOR UPDATE");
    expect(body).toContain("'order_not_terminal'");
    expect(body).toMatch(/NOT IN \('cancelled', 'refunded', 'refund_requested'\)/);
    expect(body).toContain("IS DISTINCT FROM 'failed'");
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.gift_certificate_redemption_reverse\(uuid\) FROM PUBLIC, anon, authenticated, service_role;/
    );
    expect(sqlCode(sql)).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.gift_certificate_redemption_reverse/);
    expect(sql).toContain("da8e00cd131551f5454712b7571513df");
  });

  it("GFT-01: no app code calls gift_certificate_redemption_reverse directly", () => {
    for (const rel of [
      "lib/stores/apply-store-order-status-transition.ts",
      "lib/gift-certificate/gift-certificate-rpc.ts",
      "app/api/me/store-orders/route.ts",
    ]) {
      expect(source(rel)).not.toContain("gift_certificate_redemption_reverse");
    }
  });

  it("GFT-07: purchase key is scoped per buyer and conflict lookup is same-buyer only", () => {
    const sql = source(PURCHASE_MIG);
    const body = functionBody(sql, "gift_certificate_purchase");
    expect(body).toContain("v_key := p_buyer_user_id::text || ':' || v_raw_key;");
    const handler = body.slice(body.indexOf("WHEN unique_violation THEN"));
    expect(handler).toContain("AND gl.user_id = p_buyer_user_id");
    expect(handler).toContain("'purchase_conflict'");
    expect(body).toContain("AND gl.related_id = v_raw_key");
    expect(sql).toContain("416cfd27e0a645eb6e211567af58144c");
  });

  it("GFT-08: integrity report is read-only and classifies pre-cutoff mismatches as legacy_preserved", () => {
    const sql = source(INTEGRITY_MIG);
    const body = functionBody(sql, "gift_certificate_issued_count_integrity_report");
    expect(sql).toMatch(/LANGUAGE sql\s+STABLE/);
    expect(body).toContain("timestamptz '2026-10-20 20:30:00+00'");
    expect(body).toContain("'legacy_preserved'");
    expect(body).toContain("'mismatch'");
    expect(body).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });

  it("2-D migration function bodies are ASCII only", () => {
    for (const [rel, fn] of [
      [REVERSE_MIG, "gift_certificate_redemption_reverse"],
      [PURCHASE_MIG, "gift_certificate_purchase"],
      [INTEGRITY_MIG, "gift_certificate_issued_count_integrity_report"],
    ] as const) {
      expect(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(functionBody(source(rel), fn)), rel).toBe(true);
    }
  });

  it("GFT-06: owner gift revenue route no longer reads the archive Store Cash wallet", async () => {
    const route = source("app/api/me/stores/[storeId]/gift-certificates/revenue/route.ts");
    expect(route).not.toMatch(/GIFT_TABLES|\.from\(|\.rpc\(/);
    const { GET } = await import("@/app/api/me/stores/[storeId]/gift-certificates/revenue/route");
    const res = GET();
    expect(res.status).toBe(410);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.ok).toBe(false);
    expect(Object.keys(json).some((k) => /storeCash/i.test(k))).toBe(false);
  });

  it("GFT-04: preview exposes the forfeited amount; consent only when forfeit > 0", () => {
    const over = computeCheckoutGiftApplyPreview({ amountBeforeGift: 300, giftRemaining: 1000 });
    expect(over.giftUsed).toBe(300);
    expect(over.giftForfeited).toBe(700);
    expect(checkoutGiftChoiceNeedsForfeitConsent(over)).toBe(true);
    const under = computeCheckoutGiftApplyPreview({ amountBeforeGift: 300, giftRemaining: 200 });
    expect(under.giftForfeited).toBe(0);
    expect(checkoutGiftChoiceNeedsForfeitConsent(under)).toBe(false);
    const exact = computeCheckoutGiftApplyPreview({ amountBeforeGift: 300, giftRemaining: 300 });
    expect(exact.giftForfeited).toBe(0);
  });
});
