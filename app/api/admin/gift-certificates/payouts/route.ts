import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  GIFT_RAIL_PAYOUTS_TABLE,
  isGiftRailPayoutMethod,
  loadGiftRailPayoutSummary,
  payGiftRailToStore,
} from "@/lib/gift-certificate/gift-rail-payout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * GET /api/admin/gift-certificates/payouts?storeId= — gift rail position (available / paid out) + recent payouts.
 * Owner D-2 option A: gift certificate merchant net is paid on the gift rail, never as Coin.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const storeId = s(new URL(req.url).searchParams.get("storeId"));
  if (!storeId) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  const [summary, { data: rows, error }] = await Promise.all([
    loadGiftRailPayoutSummary(gate.sb, storeId),
    gate.sb
      .from(GIFT_RAIL_PAYOUTS_TABLE)
      .select("id, amount, payout_method, payout_reference, payout_note, admin_user_id, available_before, available_after, created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (!summary) return NextResponse.json({ ok: false, error: "rpc_missing" }, { status: 503 });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    summary,
    payouts: ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      amountPhp: Math.trunc(Number(r.amount) || 0),
      payoutMethod: String(r.payout_method ?? ""),
      payoutReference: String(r.payout_reference ?? ""),
      payoutNote: r.payout_note == null ? null : String(r.payout_note),
      adminUserId: String(r.admin_user_id ?? ""),
      availableBeforePhp: Math.trunc(Number(r.available_before) || 0),
      availableAfterPhp: Math.trunc(Number(r.available_after) || 0),
      createdAt: String(r.created_at ?? ""),
    })),
  });
}

type PostBody = {
  storeId?: string;
  amountPhp?: number;
  payoutMethod?: string;
  payoutReference?: string;
  payoutNote?: string | null;
  idempotencyKey?: string;
};

/** POST — pay a store's available gift rail revenue (SQL re-checks admin, amount, reference, key). */
export async function POST(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const storeId = s(body.storeId);
  const amountPhp = Math.trunc(Number(body.amountPhp) || 0);
  const payoutMethod = s(body.payoutMethod);
  const payoutReference = s(body.payoutReference);
  const idempotencyKey = s(body.idempotencyKey);
  if (!storeId || amountPhp <= 0) return NextResponse.json({ ok: false, error: "invalid_args" }, { status: 400 });
  if (!isGiftRailPayoutMethod(payoutMethod)) {
    return NextResponse.json({ ok: false, error: "payout_method_required" }, { status: 400 });
  }
  if (!payoutReference) return NextResponse.json({ ok: false, error: "payout_reference_required" }, { status: 400 });
  // Form-scoped key from the client (stable across retries) — never generated here.
  if (!idempotencyKey) return NextResponse.json({ ok: false, error: "idempotency_key_required" }, { status: 400 });

  const result = await payGiftRailToStore(gate.sb, {
    adminUserId: gate.actor.userId,
    storeId,
    amountPhp,
    payoutMethod,
    payoutReference,
    payoutNote: s(body.payoutNote) || null,
    idempotencyKey: `gift_payout:${storeId}:${idempotencyKey}`,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, ...(result.availablePhp != null ? { availablePhp: result.availablePhp } : {}) },
      { status: result.status }
    );
  }
  return NextResponse.json({ ...result });
}
