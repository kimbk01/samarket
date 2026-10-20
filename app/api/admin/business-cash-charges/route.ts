import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
import { isUuidLikeString } from "@/lib/shared/uuid-string";
import { BUSINESS_CASH_CHARGE_REQUESTS_TABLE } from "@/lib/stores/advertising/canonical-business-cash-contract";
import {
  approveBusinessCashTopUpRequest,
  rejectBusinessCashTopUpRequest,
} from "@/lib/stores/advertising/canonical-business-cash-writer";
import {
  safeNotifyOwnerBusinessCashChargeCompleted,
  safeNotifyOwnerBusinessCashChargeRejected,
} from "@/lib/stores/advertising/delivery-ad-business-cash-charge-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Canonical Cash top-up queue.
 * Permission owner = `business` (Store economic authority — same as Coin / store-finance).
 * Do NOT invent a parallel `cash` permission key.
 */

/** CD-2 — load notify fields only; money path stays in approve/reject RPCs. */
async function loadCashChargeNotifyFields(
  sb: SupabaseClient,
  requestId: string
): Promise<{ ownerUserId: string; amountMinor: number } | null> {
  const { data, error } = await sb
    .from(BUSINESS_CASH_CHARGE_REQUESTS_TABLE)
    .select("owner_user_id, amount_minor")
    .eq("id", requestId)
    .maybeSingle();
  if (error || !data) return null;
  const ownerUserId = String((data as { owner_user_id?: string }).owner_user_id ?? "").trim();
  const amountMinor = Math.trunc(Number((data as { amount_minor?: number }).amount_minor) || 0);
  if (!ownerUserId) return null;
  return { ownerUserId, amountMinor };
}

type ChargeRequestRowWithStore = {
  id: string;
  store_id: string;
  owner_user_id: string;
  amount_minor: number;
  status: string;
  created_at: string;
  decided_at: string | null;
  reject_reason: string | null;
  stores?: { store_name?: string | null } | { store_name?: string | null }[] | null;
};

/**
 * GET — Admin canonical Cash top-up queue.
 * Query: `status` (default PENDING, `all` = no filter), optional `store_id` (UUID → 400 invalid_store_id).
 * Each row carries `store_name` via the `store_id → stores.id` FK embed (display only; id stays canonical).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const status = String(req.nextUrl.searchParams.get("status") ?? "PENDING").trim();
  const storeId = String(req.nextUrl.searchParams.get("store_id") ?? "").trim();
  if (storeId && !isUuidLikeString(storeId)) {
    return NextResponse.json({ ok: false, error: "invalid_store_id" }, { status: 400 });
  }
  let q = gate.sb
    .from(BUSINESS_CASH_CHARGE_REQUESTS_TABLE)
    .select(
      "id, store_id, owner_user_id, amount_minor, status, created_at, decided_at, reject_reason, stores(store_name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (status && status !== "all") q = q.eq("status", status);
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const requests = ((data ?? []) as unknown as ChargeRequestRowWithStore[]).map(({ stores, ...row }) => {
    const embed = Array.isArray(stores) ? stores[0] : stores;
    const storeName = String(embed?.store_name ?? "").trim();
    return { ...row, store_name: storeName || null };
  });
  return NextResponse.json({ ok: true, requests });
}

type PostBody = {
  op?: string;
  requestId?: string;
  reason?: string;
};

/** POST — approve | reject */
export async function POST(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const op = String(body.op ?? "").trim();
  const requestId = String(body.requestId ?? "").trim();
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "missing_request_id" }, { status: 400 });
  }

  if (op === "approve") {
    // R2 — Cash 적립(moneyApprove L2)도 확인창 사유 필수 → 감사 after.reason.
    const approveReason = parseAdminReason(body.reason);
    if (!approveReason) {
      return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
    }
    const result = await approveBusinessCashTopUpRequest(gate.sb, {
      adminUserId: gate.actor.userId,
      requestId,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    const notify = await loadCashChargeNotifyFields(gate.sb, requestId);
    await appendAdminRouteAudit(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "business_cash_charge_request",
      targetId: requestId,
      action: "business_cash_charge.approve",
      after: {
        idempotent: result.idempotent,
        reason: approveReason,
        ledgerId: result.ledgerId,
        balanceAfterMinor: result.balanceAfterMinor,
        ownerUserId: notify?.ownerUserId ?? null,
        amountMinor: notify?.amountMinor ?? null,
      },
    });
    if (notify) {
      await safeNotifyOwnerBusinessCashChargeCompleted(gate.sb, {
        ownerUserId: notify.ownerUserId,
        requestId,
        amountMinor: notify.amountMinor,
      });
    }
    return NextResponse.json({
      ok: true,
      idempotent: result.idempotent,
      ledgerId: result.ledgerId,
      balanceAfterMinor: result.balanceAfterMinor,
    });
  }

  if (op === "reject") {
    // L2 — 거절 사유는 사장님에게 전달된다. 화면 검증(2자)과 같은 기준을 서버에서도 강제.
    const rejectReason = parseAdminReason(body.reason);
    if (!rejectReason) {
      return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
    }
    const result = await rejectBusinessCashTopUpRequest(gate.sb, {
      adminUserId: gate.actor.userId,
      requestId,
      reason: body.reason,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    const notify = await loadCashChargeNotifyFields(gate.sb, requestId);
    await appendAdminRouteAudit(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "business_cash_charge_request",
      targetId: requestId,
      action: "business_cash_charge.reject",
      after: {
        idempotent: result.idempotent,
        reason: rejectReason,
        ownerUserId: notify?.ownerUserId ?? null,
        amountMinor: notify?.amountMinor ?? null,
      },
    });
    if (notify) {
      await safeNotifyOwnerBusinessCashChargeRejected(gate.sb, {
        ownerUserId: notify.ownerUserId,
        requestId,
      });
    }
    return NextResponse.json({ ok: true, idempotent: result.idempotent });
  }

  return NextResponse.json({ ok: false, error: "unknown_op" }, { status: 400 });
}
