/**
 * Stage 3 / 3-D2 — ADS-03 · ADS-04 · ADS-05 (partner membership money atomicity + expiry derivation).
 * DB behaviour (one TX, races, D-5) is proven in supabase/tests/isolated/stage3-3d2/run.sh.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_PARTNER_MEMBERSHIP_DECIDE_RPC,
  OWNER_APPLY_PARTNER_MEMBERSHIP_RPC,
  PARTNER_MEMBERSHIP_EXPIRE_DUE_RPC,
  adminApprovePartnerMembership,
  adminRejectPartnerMembership,
  isPartnerMembershipEffectivelyOpen,
  isPartnerMembershipPeriodExpired,
  listOrphanPartnerFundingsForAdmin,
  loadOpenPartnerMembershipForStore,
  ownerApplyPartnerMembership,
  partnerMembershipEffectiveStatusLabel,
  runPartnerMembershipExpiryBatch,
} from "@/lib/stores/advertising/delivery-ad-partner-membership-writer";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const NOW = Date.parse("2026-10-21T08:00:00Z");
const rowRaw = (over: Record<string, unknown> = {}) => ({
  id: "m-1",
  store_id: "s-1",
  status: "PENDING_REVIEW",
  period_start: null,
  period_end: null,
  fee_snapshot_minor: 10000,
  currency: "PHP",
  benefit_snapshot: {},
  advertising_discount_percent_snapshot: 0,
  config_version_snapshot: 3,
  cancel_requested_at: null,
  created_at: "2026-10-21T07:00:00Z",
  updated_at: "2026-10-21T07:00:00Z",
  ...over,
});

function rpcClient(result: { data?: unknown; error?: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  const from = vi.fn(() => {
    throw new Error("writer must not touch tables directly on this path");
  });
  return { sb: { rpc, from } as unknown as SupabaseClient, rpc, from };
}

function listClient(tables: Record<string, unknown[]>) {
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    const result = { data: tables[table] ?? [], error: null };
    for (const m of ["select", "eq", "in", "order"]) chain[m] = () => chain;
    chain.limit = () => Promise.resolve(result);
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
    return chain;
  });
  return { from } as unknown as SupabaseClient;
}

describe("ADS-05 read-time expiry derivation", () => {
  it("ACTIVE / CANCEL_PENDING past period_end is expired and not open", () => {
    const expired = { status: "ACTIVE" as const, periodEnd: "2026-10-05T03:37:57Z" };
    expect(isPartnerMembershipPeriodExpired(expired, NOW)).toBe(true);
    expect(isPartnerMembershipEffectivelyOpen(expired, NOW)).toBe(false);
    expect(
      isPartnerMembershipEffectivelyOpen({ status: "CANCEL_PENDING", periodEnd: "2026-10-01T00:00:00Z" }, NOW)
    ).toBe(false);
    expect(partnerMembershipEffectiveStatusLabel(expired, "ko", NOW)).toBe("기간 만료");
    expect(partnerMembershipEffectiveStatusLabel(expired, "en", NOW)).toBe("Expired");
  });

  it("in-period ACTIVE and PENDING_REVIEW stay open; ENDED / REJECTED never open", () => {
    expect(isPartnerMembershipEffectivelyOpen({ status: "ACTIVE", periodEnd: "2026-11-01T00:00:00Z" }, NOW)).toBe(true);
    expect(isPartnerMembershipEffectivelyOpen({ status: "PENDING_REVIEW", periodEnd: null }, NOW)).toBe(true);
    expect(isPartnerMembershipEffectivelyOpen({ status: "ENDED", periodEnd: null }, NOW)).toBe(false);
    expect(isPartnerMembershipEffectivelyOpen({ status: "REJECTED", periodEnd: null }, NOW)).toBe(false);
    expect(partnerMembershipEffectiveStatusLabel({ status: "ACTIVE", periodEnd: "2026-11-01T00:00:00Z" }, "ko", NOW)).toBe("이용 중");
  });

  it("loadOpenPartnerMembershipForStore skips an expired legacy ACTIVE row (re-apply allowed)", async () => {
    const sb = listClient({
      delivery_ad_partner_memberships: [rowRaw({ status: "ACTIVE", period_end: "2020-01-01T00:00:00Z" })],
    });
    expect(await loadOpenPartnerMembershipForStore(sb, "s-1")).toBeNull();
    const sb2 = listClient({
      delivery_ad_partner_memberships: [rowRaw({ status: "ACTIVE", period_end: "2999-01-01T00:00:00Z" })],
    });
    expect((await loadOpenPartnerMembershipForStore(sb2, "s-1"))?.id).toBe("m-1");
  });
});

describe("ADS-04 owner apply = one RPC (row + Cash debit in one TX)", () => {
  it("calls owner_apply_partner_membership with the request id and maps the row", async () => {
    const { sb, rpc, from } = rpcClient({
      data: { ok: true, idempotent: false, membership: rowRaw(), amount_minor: 10000 },
    });
    const res = await ownerApplyPartnerMembership(sb, { storeId: "s-1", actorUserId: "u-1", requestId: "req-1" });
    expect(rpc).toHaveBeenCalledWith(OWNER_APPLY_PARTNER_MEMBERSHIP_RPC, {
      p_store_id: "s-1",
      p_owner_user_id: "u-1",
      p_request_id: "req-1",
    });
    expect(from).not.toHaveBeenCalled();
    expect(res).toMatchObject({ ok: true, amountMinor: 10000, idempotent: false, payment: "BUSINESS_CASH_SECURED" });
  });

  it("generates a request id when the client sends none", async () => {
    const { sb, rpc } = rpcClient({ data: { ok: true, membership: rowRaw(), amount_minor: 1 } });
    await ownerApplyPartnerMembership(sb, { storeId: "s-1", actorUserId: "u-1" });
    expect(String(rpc.mock.calls[0][1].p_request_id).length).toBeGreaterThan(10);
  });

  it("maps insufficient Cash, already_open and debit-stage failures; no compensation writes", async () => {
    const insufficient = rpcClient({
      data: { ok: false, error: "INSUFFICIENT_BUSINESS_CASH", available_minor: 5000, required_minor: 10000, shortage_minor: 5000, stage: "debit" },
    });
    expect(await ownerApplyPartnerMembership(insufficient.sb, { storeId: "s-1", actorUserId: "u-1" })).toMatchObject({
      ok: false,
      error: "INSUFFICIENT_BUSINESS_CASH",
      insufficient: { shortageMinor: 5000 },
    });
    expect(insufficient.from).not.toHaveBeenCalled();
    const open = rpcClient({ data: { ok: false, error: "already_open" } });
    expect(await ownerApplyPartnerMembership(open.sb, { storeId: "s-1", actorUserId: "u-1" })).toMatchObject({ ok: false, error: "already_open" });
    const debit = rpcClient({ data: { ok: false, error: "forbidden_x", stage: "debit" } });
    expect(await ownerApplyPartnerMembership(debit.sb, { storeId: "s-1", actorUserId: "u-1" })).toMatchObject({ ok: false, error: "bc_debit_failed" });
    const net = rpcClient({ error: { message: "timeout" } });
    expect(await ownerApplyPartnerMembership(net.sb, { storeId: "s-1", actorUserId: "u-1" })).toMatchObject({ ok: false, error: "db_error" });
  });

  it("writer has no insert → debit → delete compensation path anymore", () => {
    const src = read("lib/stores/advertising/delivery-ad-partner-membership-writer.ts");
    expect(src).not.toContain(".delete()");
    expect(src).not.toContain("debitBusinessCashForDeliveryAd");
    expect(src).not.toContain("refundBusinessCashForRejectedDeliveryAd");
    const sql = read("supabase/migrations/20270604150000_ads_partner_membership_atomic.sql");
    expect(sql).toContain("delivery_ad_partner_memberships_open_store_uidx");
    expect(sql).toContain("apply_idempotency_key");
  });
});

describe("ADS-03 admin decide = one RPC (refund + REJECTED / funding check + ACTIVE)", () => {
  it("reject passes action + reason and returns refund idempotency", async () => {
    const { sb, rpc, from } = rpcClient({
      data: { ok: true, membership: rowRaw({ status: "REJECTED" }), refund: true, refund_idempotent: false },
    });
    const res = await adminRejectPartnerMembership(sb, { membershipId: "m-1", actorUserId: "a-1", reason: "spam" });
    expect(rpc).toHaveBeenCalledWith(ADMIN_PARTNER_MEMBERSHIP_DECIDE_RPC, {
      p_admin_user_id: "a-1",
      p_membership_id: "m-1",
      p_action: "reject",
      p_reason: "spam",
      p_period_days: null,
    });
    expect(from).not.toHaveBeenCalled();
    expect(res).toMatchObject({ ok: true, refundIdempotent: false, membership: { status: "REJECTED" } });
  });

  it("approve sends the period and maps funding_required / illegal_transition", async () => {
    const ok = rpcClient({ data: { ok: true, membership: rowRaw({ status: "ACTIVE" }) } });
    await adminApprovePartnerMembership(ok.sb, { membershipId: "m-1", actorUserId: "a-1", reason: "", periodDays: 30 });
    expect(ok.rpc.mock.calls[0][1]).toMatchObject({ p_action: "approve", p_period_days: 30, p_reason: "admin_partner_approve" });
    const nf = rpcClient({ data: { ok: false, error: "funding_required" } });
    expect(await adminApprovePartnerMembership(nf.sb, { membershipId: "m-1", actorUserId: "a-1", reason: "x" })).toMatchObject({ ok: false, error: "funding_required" });
    const race = rpcClient({ data: { ok: false, error: "illegal_transition", status: "REJECTED" } });
    expect(await adminApprovePartnerMembership(race.sb, { membershipId: "m-1", actorUserId: "a-1", reason: "x" })).toMatchObject({ ok: false, error: "illegal_transition" });
  });
});

describe("ADS-05 expiry cron + ADS-04 orphan funding view", () => {
  it("expiry batch calls the SQL function and returns the count", async () => {
    const { sb, rpc } = rpcClient({ data: { ok: true, ended: 2 } });
    expect(await runPartnerMembershipExpiryBatch(sb)).toEqual({ ok: true, ended: 2 });
    expect(rpc).toHaveBeenCalledWith(PARTNER_MEMBERSHIP_EXPIRE_DUE_RPC, { p_limit: 200 });
    const cron = read("app/api/cron/delivery-ads-schedule-transitions/route.ts");
    expect(cron).toContain("runPartnerMembershipExpiryBatch");
    const sql = read("supabase/migrations/20270604150000_ads_partner_membership_atomic.sql");
    expect(sql).toContain("period_end >= c_apply_from");
  });

  it("orphan fundings = partner fundings without a membership row", async () => {
    const sb = listClient({
      delivery_ad_canonical_bc_fundings: [
        { id: "f-1", application_id: "m-1", store_id: "s-1", status: "SECURED", amount_minor: 10000, secured_at: null },
        { id: "f-2", application_id: "m-x", store_id: "s-2", status: "SECURED", amount_minor: 10000, secured_at: null },
      ],
      delivery_ad_partner_memberships: [{ id: "m-1" }],
    });
    const res = await listOrphanPartnerFundingsForAdmin(sb);
    expect(res.items.map((r) => r.fundingId)).toEqual(["f-2"]);
  });
});
