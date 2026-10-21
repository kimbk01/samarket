/**
 * Stage 3 / 3-D2 — ADS-13: owner platform popup submit is ONE DB transaction
 * (`owner_submit_platform_popup_request`). This file is the lock named in owner-popup-new-sales-gate.ts:
 * new sales must not be re-enabled while the submit path is a TS multi-step write.
 * DB behaviour (single debit, failure state, race) is proven in supabase/tests/isolated/stage3-3d2/run.sh.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/platform-popup/owner-request-loader", () => ({
  PLATFORM_POPUP_OWNER_REQUEST_TABLE: "platform_popup_owner_requests",
  loadPlatformPopupAdPackage: vi.fn(),
  mapPlatformPopupOwnerRequestRow: vi.fn(),
  loadPlatformPopupOwnerRequest: vi.fn(),
}));

import { loadPlatformPopupOwnerRequest } from "@/lib/platform-popup/owner-request-loader";
import {
  OWNER_SUBMIT_PLATFORM_POPUP_REQUEST_RPC,
  submitPlatformPopupOwnerRequest,
} from "@/lib/platform-popup/owner-request-writer";
import { OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED } from "@/lib/platform-popup/owner-popup-new-sales-gate";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const draftRow = {
  id: "r-1",
  ownerUserId: "u-1",
  storeId: "s-1",
  requestStatus: "draft",
  paymentStatus: "unfunded",
  packageId: "p-1",
  priceMinor: 7000,
  requestedSurfaces: ["GLOBAL"],
  creativeAssetPath: "a.png",
  creativeAssetUrl: null,
  requestedStartAt: null,
  requestedEndAt: null,
  ctaType: "store",
  ctaTarget: "s-1",
  externalUrl: null,
  submitIdempotencyKey: null,
  submittedAt: null,
};

function client(rpcResult: { data?: unknown; error?: { message: string; code?: string } | null }) {
  const rpc = vi.fn().mockResolvedValue({ data: rpcResult.data ?? null, error: rpcResult.error ?? null });
  const update = vi.fn();
  const from = vi.fn(() => ({ update }));
  return { sb: { rpc, from } as unknown as SupabaseClient, rpc, update };
}

describe("ADS-13 owner popup submit atomic RPC", () => {
  it("new sales stay disabled (gate) and the gate documents the RPC precondition", () => {
    expect(OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED).toBe(false);
    const gate = read("lib/platform-popup/owner-popup-new-sales-gate.ts");
    expect(gate).toContain("owner_submit_platform_popup_request");
    expect(gate).toContain("RE-ENABLE PRECONDITION");
  });

  it("writer calls only the RPC (no key bind / debit / status UPDATE from TS)", () => {
    const src = read("lib/platform-popup/owner-request-writer.ts");
    const submit = src.slice(
      src.indexOf("export async function submitPlatformPopupOwnerRequest("),
      src.indexOf("export async function cancelPlatformPopupOwnerRequest(")
    );
    expect(submit).toContain("OWNER_SUBMIT_PLATFORM_POPUP_REQUEST_RPC");
    expect(submit).not.toContain("debitBusinessCashForDeliveryAd");
    expect(submit).not.toContain(".update(");
    const sql = read("supabase/migrations/20270604150100_platform_popup_owner_submit_atomic.sql");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("public.business_cash_delivery_ad_spend(");
  });

  it("success maps funding and never writes tables directly", async () => {
    vi.mocked(loadPlatformPopupOwnerRequest)
      .mockResolvedValueOnce(draftRow as never)
      .mockResolvedValueOnce({ ...draftRow, requestStatus: "submitted", paymentStatus: "funded" } as never);
    const { sb, rpc, update } = client({
      data: { ok: true, idempotent: false, funding_id: "f-1", amount_minor: 7000, request: {} },
    });
    const res = await submitPlatformPopupOwnerRequest(sb, { requestId: "r-1", ownerUserId: "u-1", idempotencyKey: "k-1" });
    expect(rpc).toHaveBeenCalledWith(OWNER_SUBMIT_PLATFORM_POPUP_REQUEST_RPC, {
      p_request_id: "r-1",
      p_owner_user_id: "u-1",
      p_idempotency_key: "k-1",
    });
    expect(update).not.toHaveBeenCalled();
    expect(res).toMatchObject({ ok: true, idempotent: false, row: { requestStatus: "submitted" } });
  });

  it("insufficient Cash → 402; illegal_transition → 409; unique race → duplicate_submit", async () => {
    vi.mocked(loadPlatformPopupOwnerRequest).mockResolvedValue(draftRow as never);
    const a = client({
      data: { ok: false, error: "INSUFFICIENT_BUSINESS_CASH", available_minor: 0, required_minor: 7000, shortage_minor: 7000, stage: "debit" },
    });
    expect(await submitPlatformPopupOwnerRequest(a.sb, { requestId: "r-1", ownerUserId: "u-1", idempotencyKey: "k" })).toMatchObject({
      ok: false,
      error: "INSUFFICIENT_BUSINESS_CASH",
      httpStatus: 402,
    });
    const b = client({ data: { ok: false, error: "illegal_transition", status: "submitted" } });
    expect(await submitPlatformPopupOwnerRequest(b.sb, { requestId: "r-1", ownerUserId: "u-1", idempotencyKey: "k" })).toMatchObject({
      ok: false,
      error: "illegal_transition",
      httpStatus: 409,
    });
    const c = client({ error: { message: "duplicate key value violates unique constraint", code: "23505" } });
    expect(await submitPlatformPopupOwnerRequest(c.sb, { requestId: "r-1", ownerUserId: "u-1", idempotencyKey: "k" })).toMatchObject({
      ok: false,
      error: "duplicate_submit",
    });
  });
});
