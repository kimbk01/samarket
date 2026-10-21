/**
 * Stage 2-A (delivery-owner audit G-1 §5-A): FIN-04 ⊃ IA-22 (deposit evidence · stable form keys · confirm),
 * N-4B (no TS writer of business_cash_charge_requests), FIN-08 (super_admin correction), FIN-02/FIN-12 wiring.
 * DB behaviour itself is proven in supabase/tests/isolated/stage2-2a (throwaway PostgreSQL).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adminAdjustStoreBalance,
  approveBusinessCashTopUpRequest,
  createBusinessCashTopUpRequest,
  loadBusinessCashChargePolicy,
} from "@/lib/stores/advertising/canonical-business-cash-writer";
import {
  BC_CHARGE_DEFAULT_PAYMENT_METHODS,
  parseBusinessCashChargePolicy,
} from "@/lib/stores/advertising/canonical-business-cash-contract";
import { newOwnerFormRequestKey } from "@/lib/business/owner-form-request-key";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

function rpcSb(result: { data: unknown; error: { message: string } | null }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> | undefined }> = [];
  return {
    calls,
    from(table: string) {
      throw new Error(`unexpected table access: ${table}`);
    },
    rpc(fn: string, args?: Record<string, unknown>) {
      calls.push({ fn, args });
      return Promise.resolve(result);
    },
  };
}

describe("FIN-04 owner top-up request — DB RPC only (N-4B)", () => {
  it("calls owner_create_business_cash_charge_request with evidence + the caller's key; never touches the table", async () => {
    const sb = rpcSb({ data: { ok: true, request_id: "r1", status: "PENDING", idempotent: false }, error: null });
    const res = await createBusinessCashTopUpRequest(sb as never, {
      storeId: "s1",
      ownerUserId: "u1",
      amountMinor: 150000,
      paymentMethod: " GCash ",
      paymentReference: " GC-1 ",
      proofFilePath: null,
      idempotencyKey: "bc_topup:abc",
    });
    expect(res).toEqual({ ok: true, requestId: "r1", status: "PENDING", idempotent: false });
    expect(sb.calls).toEqual([
      {
        fn: "owner_create_business_cash_charge_request",
        args: {
          p_owner_user_id: "u1",
          p_store_id: "s1",
          p_amount_minor: 150000,
          p_payment_method: "gcash",
          p_payment_reference: "GC-1",
          p_proof_file_path: null,
          p_idempotency_key: "bc_topup:abc",
        },
      },
    ]);
  });

  it("refuses before the RPC when key / method / reference is missing", async () => {
    const sb = rpcSb({ data: null, error: null });
    const base = { storeId: "s1", ownerUserId: "u1", amountMinor: 100, paymentMethod: "gcash", paymentReference: "R-1", idempotencyKey: "k" };
    expect(await createBusinessCashTopUpRequest(sb as never, { ...base, idempotencyKey: " " })).toEqual({ ok: false, error: "idempotency_required" });
    expect(await createBusinessCashTopUpRequest(sb as never, { ...base, paymentMethod: "" })).toEqual({ ok: false, error: "payment_method_required" });
    expect(await createBusinessCashTopUpRequest(sb as never, { ...base, paymentReference: "" })).toEqual({ ok: false, error: "payment_reference_required" });
    expect(sb.calls).toHaveLength(0);
  });

  it("passes DB refusal codes through (pending_request_exists, payment_reference_duplicate)", async () => {
    for (const code of ["pending_request_exists", "payment_reference_duplicate", "amount_exceeds_monthly_cap"]) {
      const sb = rpcSb({ data: { ok: false, error: code }, error: null });
      const res = await createBusinessCashTopUpRequest(sb as never, {
        storeId: "s1", ownerUserId: "u1", amountMinor: 100, paymentMethod: "gcash", paymentReference: "R", idempotencyKey: "k",
      });
      expect(res).toEqual({ ok: false, error: code });
    }
  });

  it("no TS module writes business_cash_charge_requests (insert/update/upsert/delete)", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name)) {
          const src = readFileSync(p, "utf8");
          const re = /\.from\(\s*(?:BUSINESS_CASH_CHARGE_REQUESTS_TABLE|["'`]business_cash_charge_requests["'`])\s*\)\s*\.(insert|update|upsert|delete)\(/g;
          if (re.test(src)) offenders.push(p);
        }
      }
    };
    for (const d of ["lib", "app", "components"]) walk(resolve(ROOT, d));
    expect(offenders).toEqual([]);
  });

  it("policy parsing: defaults = no caps, default methods, reference always required", () => {
    expect(parseBusinessCashChargePolicy(null)).toEqual({
      perRequestMaxMinor: null,
      monthlyMaxMinor: null,
      paymentMethods: [...BC_CHARGE_DEFAULT_PAYMENT_METHODS],
      receivingAccountNote: null,
      paymentReferenceRequired: true,
    });
    expect(
      parseBusinessCashChargePolicy({ per_request_max_minor: 5000, monthly_max_minor: null, payment_methods: ["GCash"], receiving_account_note: " BPI 123 " })
    ).toMatchObject({ perRequestMaxMinor: 5000, monthlyMaxMinor: null, paymentMethods: ["gcash"], receivingAccountNote: "BPI 123" });
  });

  it("policy RPC failure falls back to the DB defaults", async () => {
    const sb = rpcSb({ data: null, error: { message: "missing" } });
    expect((await loadBusinessCashChargePolicy(sb as never)).paymentMethods).toEqual([...BC_CHARGE_DEFAULT_PAYMENT_METHODS]);
  });
});

describe("FIN-04 approval — reason reaches the RPC; CD-2 notify wire unchanged", () => {
  it("approveBusinessCashTopUpRequest sends p_reason", async () => {
    const sb = rpcSb({ data: { ok: true, idempotent: false, ledger_id: "l1", balance_after_minor: 1000 }, error: null });
    const res = await approveBusinessCashTopUpRequest(sb as never, { adminUserId: "a1", requestId: "r1", reason: "GCash matched" });
    expect(res).toEqual({ ok: true, idempotent: false, ledgerId: "l1", balanceAfterMinor: 1000 });
    expect(sb.calls[0]).toEqual({
      fn: "approve_business_cash_charge_request",
      args: { p_admin_user_id: "a1", p_request_id: "r1", p_reason: "GCash matched" },
    });
  });

  it("admin route passes the confirm reason and keeps both CD-2 notify calls after success", () => {
    const route = read("app/api/admin/business-cash-charges/route.ts");
    expect(route).toMatch(/approveBusinessCashTopUpRequest\(gate\.sb, \{[\s\S]*reason: approveReason/);
    expect(route).toContain("safeNotifyOwnerBusinessCashChargeCompleted");
    expect(route).toContain("safeNotifyOwnerBusinessCashChargeRejected");
    expect(route).toContain('requireAdminPermission("business")');
    expect(route).toContain("payment_reference");
  });

  it("SQL: approval re-checks platform admin, refuses self-store and no-reference, stores the reason", () => {
    const mig = read("supabase/migrations/20270603110100_stage2a_fin04_cash_charge_request_evidence.sql");
    expect(mig).toContain("internal.is_platform_admin(p_admin_user_id)");
    expect(mig).toContain("self_store_approval_forbidden");
    expect(mig).toContain("payment_reference_missing");
    expect(mig).toContain("decided_reason = v_reason");
    expect(mig).toContain("business_cash_charge_requests_one_pending_per_store");
    expect(mig).toContain("business_cash_charge_requests_store_reference_uidx");
    const n4b = read("supabase/migrations/20270603110400_stage2a_n4b_cash_charge_requests_write_lock.sql");
    expect(n4b).toContain("REVOKE INSERT, UPDATE, DELETE ON public.business_cash_charge_requests FROM service_role;");
    expect(n4b).toContain("NOT VALID");
  });
});

describe("IA-22 — money forms keep one key per submission (no Date.now() keys)", () => {
  const forms = {
    cash: read("components/business/owner/OwnerBusinessCashView.tsx"),
    withdrawal: read("components/business/owner/OwnerCoinWithdrawalPanel.tsx"),
  };

  it("keys live in form state, are sent as-is, and are replaced only after success", () => {
    expect(forms.cash).toContain('useState(() => newOwnerFormRequestKey("bc_topup"))');
    expect(forms.cash).toContain('useState(() => newOwnerFormRequestKey("sp2bc"))');
    expect(forms.cash).toContain("idempotencyKey: topUpKey,");
    expect(forms.cash).toContain("idempotencyKey: convertKey,");
    expect(forms.withdrawal).toContain('useState(() => newOwnerFormRequestKey("coin_withdrawal"))');
    expect(forms.withdrawal).toContain("idempotencyKey: requestKey,");
    for (const src of Object.values(forms)) {
      expect(src).not.toMatch(/idempotencyKey:\s*`[^`]*Date\.now\(\)/);
    }
    // regenerated after the success notice path only
    expect(forms.cash.indexOf('setTopUpKey(newOwnerFormRequestKey("bc_topup"))')).toBeGreaterThan(
      forms.cash.indexOf("owner_finance_cash_topup_pending")
    );
  });

  it("same form submitted twice sends the same key (key is not derived per submit)", () => {
    // The form computes the key once (lazy useState initializer). Simulate two submits reading the same state.
    let initCalls = 0;
    const lazyState = <T,>(init: () => T) => {
      let v: T | undefined;
      return () => (v === undefined ? ((initCalls += 1), (v = init())) : v);
    };
    const key = lazyState(() => newOwnerFormRequestKey("bc_topup"));
    const first = key();
    const second = key();
    expect(first).toBe(second);
    expect(initCalls).toBe(1);
    expect(first).toMatch(/^bc_topup:/);
    expect(newOwnerFormRequestKey("bc_topup")).not.toBe(first);
  });

  it("server no longer invents a top-up key (missing → 400 idempotency_required)", () => {
    const route = read("app/api/me/stores/[storeId]/business-cash/route.ts");
    expect(route).not.toMatch(/bc_topup:\$\{userId\}/);
    expect(route).not.toContain("Date.now()");
    expect(route).toContain('error: "idempotency_required"');
    expect(route).toContain("paymentReference");
  });

  it("top-up form requires a deposit reference; withdrawal asks for confirmation first", () => {
    expect(forms.cash).toContain("owner_bc_topup_reference_required");
    expect(forms.cash).toContain('data-owner-bc-topup-reference="1"');
    expect(forms.withdrawal).toContain("OwnerStoreAdminConfirmModal");
    expect(forms.withdrawal).toContain("onClick={openConfirm}");
  });
});

describe("FIN-08 — super_admin correction", () => {
  it("maps cash (minor) / coin (whole) arguments to the two RPCs", async () => {
    const cash = rpcSb({ data: { ok: true, idempotent: false, ledger_id: "l", balance_before_minor: 0, balance_after_minor: 500 }, error: null });
    const r1 = await adminAdjustStoreBalance(cash as never, {
      adminUserId: "a", storeId: "s", asset: "cash", direction: "credit", amount: 500, reason: "fix", evidenceRef: "TX-1", idempotencyKey: "k1", ledgerOnly: false,
    });
    expect(r1).toEqual({ ok: true, idempotent: false, ledgerId: "l", balanceBefore: 0, balanceAfter: 500 });
    expect(cash.calls[0]).toEqual({
      fn: "admin_adjust_business_cash",
      args: { p_admin_user_id: "a", p_store_id: "s", p_direction: "credit", p_amount_minor: 500, p_reason: "fix", p_evidence_ref: "TX-1", p_idempotency_key: "k1", p_ledger_only: false },
    });
    const coin = rpcSb({ data: { ok: false, error: "super_admin_required" }, error: null });
    const r2 = await adminAdjustStoreBalance(coin as never, {
      adminUserId: "a", storeId: "s", asset: "coin", direction: "debit", amount: 3, reason: "fix", evidenceRef: "TX-1", idempotencyKey: "k2", ledgerOnly: true,
    });
    expect(r2).toEqual({ ok: false, error: "super_admin_required" });
    expect(coin.calls[0]?.fn).toBe("admin_adjust_store_coin");
    expect(coin.calls[0]?.args).toMatchObject({ p_amount: 3, p_ledger_only: true });
  });

  it("route is super_admin only; the RPC writes ledger + audit, the route adds the request-context audit", () => {
    const route = read("app/api/admin/store-finance/adjust/route.ts");
    expect(route).toContain("requireSuperAdmin()");
    expect(route).toContain("evidence_required");
    expect(route).toContain("appendAdminRouteAudit(gate.sb, req");
    const mig = read("supabase/migrations/20270603110200_stage2a_fin08_admin_balance_correction.sql");
    expect(mig).toContain("internal.is_platform_super_admin(p_admin_user_id)");
    expect(mig).toContain("INSERT INTO public.audit_logs");
    expect(mig).toContain("'insufficient_balance'");
    expect(mig).toContain("'2026-10-20 20:30:00+00'::timestamptz");
    // R-D5 classification sits after block 2-B's integrity redefinition (20270603120200) and keeps its key.
    const d5 = read("supabase/migrations/20270603125000_stage2a_fin08_integrity_d5_legacy.sql");
    expect(d5).toContain("legacy_preserved");
    expect(d5).toContain("'new_ids'");
    expect(d5).toContain("sale_coin_le_platform_coupon");
    expect(d5).toContain("e4d32a11b5e3a20729beb319e2f19f2d");
  });
});

describe("FIN-02 / FIN-12 SQL wiring", () => {
  const mig = read("supabase/migrations/20270603110000_stage2a_fin02_fin12_sale_fee_settle.sql");
  it("settlement key carries the cumulative paid amount", () => {
    expect(mig).toContain("'sale_fee_settle:' || v_ob.id::text || ':' || v_ob.fee_paid_minor::text || ':' || v_pay::text");
  });
  it("refund approval settles other arrears in the same function", () => {
    expect(mig).toMatch(/IF v_refund > 0 THEN\s+v_settle := public\.settle_store_sale_fee_obligations\(v_store\);/);
  });
  it("redefined function bodies are ASCII only", () => {
    for (const f of [
      "20270603110000_stage2a_fin02_fin12_sale_fee_settle.sql",
      "20270603110100_stage2a_fin04_cash_charge_request_evidence.sql",
      "20270603110200_stage2a_fin08_admin_balance_correction.sql",
      "20270603110300_stage2a_fin11_store_cash_position_open_count.sql",
      "20270603125000_stage2a_fin08_integrity_d5_legacy.sql",
    ]) {
      const src = read(`supabase/migrations/${f}`);
      const bodies = src.match(/AS \$(fn|function)\$[\s\S]*?\$\1\$/g) ?? [];
      expect(bodies.length).toBeGreaterThan(0);
      for (const b of bodies) expect(/[^\x00-\x7F]/.test(b)).toBe(false);
    }
  });
});
