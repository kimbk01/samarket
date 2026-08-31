import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { BUSINESS_CASH_CHARGE_REQUESTS_TABLE } from "@/lib/stores/advertising/canonical-business-cash-contract";
import {
  approveBusinessCashTopUpRequest,
  rejectBusinessCashTopUpRequest,
} from "@/lib/stores/advertising/canonical-business-cash-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — Admin Business Cash top-up queue. */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const status = String(req.nextUrl.searchParams.get("status") ?? "PENDING").trim();
  let q = sb
    .from(BUSINESS_CASH_CHARGE_REQUESTS_TABLE)
    .select(
      "id, store_id, owner_user_id, amount_minor, status, created_at, decided_at, reject_reason"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, requests: data ?? [] });
}

type PostBody = {
  op?: string;
  requestId?: string;
  reason?: string;
};

/** POST — approve | reject */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

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
    const result = await approveBusinessCashTopUpRequest(sb, {
      adminUserId: admin.userId,
      requestId,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      idempotent: result.idempotent,
      ledgerId: result.ledgerId,
      balanceAfterMinor: result.balanceAfterMinor,
    });
  }

  if (op === "reject") {
    const result = await rejectBusinessCashTopUpRequest(sb, {
      adminUserId: admin.userId,
      requestId,
      reason: body.reason,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, idempotent: result.idempotent });
  }

  return NextResponse.json({ ok: false, error: "unknown_op" }, { status: 400 });
}
