/**
 * PRE-3B — Owner Delivery Ads transactional transition + audit durability contracts.
 * Static / source contracts only. DB runtime atomicity = NOT_PROVEN without live Supabase.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canOwnerRequestLifecycleTransition,
  canTransitionDeliveryAdLifecycle,
} from "@/lib/stores/advertising/delivery-ad-lifecycle";

const ROOT = process.cwd();
const MIG = join(
  ROOT,
  "supabase/migrations/20261201210000_delivery_ads_pre3b_owner_transition_durable.sql"
);
const ADMIN_MIG = join(
  ROOT,
  "supabase/migrations/20261201150000_delivery_ads_cut_f_admin_transition_rpc.sql"
);
const SPONSORED_WRITER = join(ROOT, "lib/stores/advertising/owner-store-sponsored-writer.ts");
const BANNER_WRITER = join(ROOT, "lib/stores/advertising/owner-banner-writer.ts");
const ACTIONS_ROUTE = join(
  ROOT,
  "app/api/me/stores/[storeId]/delivery-ads/[campaignId]/actions/route.ts"
);
const CASE_MIG = join(
  ROOT,
  "supabase/migrations/20261201200000_delivery_ads_cut3a_operations_case.sql"
);

function migSrc(): string {
  expect(existsSync(MIG)).toBe(true);
  return readFileSync(MIG, "utf8");
}

describe("PRE-3B Owner transactional transition SQL contract", () => {
  it("defines owner_delivery_ad_transition with FOR UPDATE + expected lifecycle CAS", () => {
    const sql = migSrc();
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.owner_delivery_ad_transition");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("p_expected_lifecycle");
    expect(sql).toContain("stale_lifecycle");
    expect(sql).toContain("owner_user_id IS DISTINCT FROM p_owner_user_id");
  });

  it("updates campaign and inserts audit in same function body (same DB transaction)", () => {
    const sql = migSrc();
    expect(sql).toMatch(/UPDATE public\.store_paid_ad_campaigns[\s\S]*INSERT INTO public\.delivery_ad_audit_logs/);
    expect(sql).toMatch(/UPDATE public\.store_banner_ad_campaigns[\s\S]*INSERT INTO public\.delivery_ad_audit_logs/);
    expect(sql).toContain("RETURNING id INTO v_audit_id");
    expect(sql).toContain("'audit_id', v_audit_id");
    // No nested BEGIN/COMMIT inventing a separate txn — function invocation is the unit
    expect(sql).not.toMatch(/BEGIN\s*;\s*UPDATE/i);
  });

  it("service_role execute only; anon/authenticated revoked", () => {
    const sql = migSrc();
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.owner_delivery_ad_transition(uuid, text, uuid, text, text, text) FROM anon, authenticated"
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.owner_delivery_ad_transition(uuid, text, uuid, text, text, text) TO service_role"
    );
  });

  it("blocks PAUSED_ADMIN → ACTIVE via owner allowlist (no owner resume from admin pause)", () => {
    const sql = migSrc();
    expect(sql).toContain("PAUSED_OWNER' AND v_to = 'ACTIVE");
    expect(sql).not.toMatch(/PAUSED_ADMIN'\s+AND\s+v_to\s*=\s*'ACTIVE/);
    expect(canOwnerRequestLifecycleTransition("PAUSED_ADMIN", "ACTIVE")).toBe(false);
    expect(canTransitionDeliveryAdLifecycle("PAUSED_ADMIN", "ACTIVE", "owner")).toBe(false);
  });

  it("does not create ops case / notification / message / outbox schema", () => {
    const sql = migSrc();
    expect(sql).not.toMatch(
      /delivery_ad_operations_cases|delivery_ad_operations_threads|notification_events|ensureDeliveryAdOperationsCase|outbox|message/
    );
    expect(existsSync(CASE_MIG)).toBe(true);
  });

  it("does not modify admin_delivery_ad_transition", () => {
    const pre3b = migSrc();
    expect(pre3b).not.toContain("admin_delivery_ad_transition");
    expect(existsSync(ADMIN_MIG)).toBe(true);
    const admin = readFileSync(ADMIN_MIG, "utf8");
    expect(admin).toContain("CREATE OR REPLACE FUNCTION public.admin_delivery_ad_transition");
  });
});

describe("PRE-3B Owner TS writers call transactional RPC", () => {
  it("sponsored transition uses RPC and returns auditId; no sequential update+audit", () => {
    const src = readFileSync(SPONSORED_WRITER, "utf8");
    expect(src).toContain('rpc("owner_delivery_ad_transition"');
    expect(src).toContain("auditId");
    expect(src).toContain("p_expected_lifecycle");
    expect(src).toContain("p_product_kind: \"store_sponsored\"");
    // transition body must not do separate non-RPC audit insert after campaign update
    const fnStart = src.indexOf("export async function transitionOwnerSponsoredCampaign");
    const fnEnd = src.indexOf("export async function deleteOwnerSponsoredDraft", fnStart);
    expect(fnStart).toBeGreaterThan(-1);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const body = src.slice(fnStart, fnEnd);
    expect(body).toContain("owner_delivery_ad_transition");
    expect(body).not.toMatch(/\.from\(STORE_SPONSORED_CAMPAIGN_TABLE\)\s*\.update/);
    expect(body).not.toContain("writeAudit(");
  });

  it("banner transition uses RPC with CAS expected lifecycle; closes no-CAS gap", () => {
    const src = readFileSync(BANNER_WRITER, "utf8");
    const fnStart = src.indexOf("export async function transitionOwnerBannerCampaign");
    const fnEnd = src.indexOf("export async function deleteOwnerBannerDraft", fnStart);
    const body = src.slice(fnStart, fnEnd);
    expect(body).toContain('rpc("owner_delivery_ad_transition"');
    expect(body).toContain("p_product_kind: \"banner\"");
    expect(body).toContain("p_expected_lifecycle");
    expect(body).toContain("auditId");
    expect(body).not.toMatch(/\.from\(BANNER_AD_CAMPAIGN_TABLE\)\s*\.update/);
    expect(body).not.toMatch(/\.from\(DELIVERY_AD_AUDIT_LOG_TABLE\)\s*\.insert/);
  });

  it("wrong-owner / stale / illegal map to existing error vocabulary", () => {
    const sponsored = readFileSync(SPONSORED_WRITER, "utf8");
    expect(sponsored).toContain('stale_lifecycle") return "duplicate_submit"');
    expect(sponsored).toContain('forbidden") return "forbidden"');
    const banner = readFileSync(BANNER_WRITER, "utf8");
    expect(banner).toContain('stale_lifecycle") return "duplicate_submit"');
  });
});

describe("PRE-3B Owner actions route contract preserved", () => {
  it("keeps campaign response shape; does not expose auditId to client", () => {
    const src = readFileSync(ACTIONS_ROUTE, "utf8");
    expect(src).toContain("transitionOwnerSponsoredCampaign");
    expect(src).toContain("transitionOwnerBannerCampaign");
    expect(src).toContain("return NextResponse.json({ ok: true, campaign: result.row })");
    expect(src).not.toContain("auditId");
    expect(src).not.toContain("ensureDeliveryAdOperationsCase");
  });
});

describe("PRE-3B atomicity evidence classification", () => {
  it("SQL same-function UPDATE+INSERT contract is present (runtime DB proof separate)", () => {
    const sql = migSrc();
    // Forced audit failure → campaign rollback relies on PL/pgSQL exception subtransaction.
    expect(sql).toContain("EXCEPTION");
    expect(sql).toContain("WHEN OTHERS THEN");
    expect(sql).toContain("INSERT INTO public.delivery_ad_audit_logs");
    // Classification for final report: ATOMICITY SQL CONTRACT = PASS; DB RUNTIME = NOT_PROVEN
    expect(true).toBe(true);
  });
});
