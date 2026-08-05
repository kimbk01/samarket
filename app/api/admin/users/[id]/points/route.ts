import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  POINT_CHARGE_REQUEST_ROW_SELECT,
  POINT_LEDGER_ROW_SELECT,
} from "@/lib/points/point-query-select";
import {
  isMissingPointsTable,
  normalizeChargeRequest,
  normalizeLedgerRow,
} from "@/lib/points/admin-user-points-shared";
import { adjustUserPoints, readUserPointBalance } from "@/lib/points/user-point-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const userId = id?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const { sb } = gate;
  const { data: profile } = await sb
    .from("profiles")
    .select("nickname, points")
    .eq("id", userId)
    .maybeSingle();
  const userNickname = String((profile as { nickname?: string } | null)?.nickname ?? "");
  const balance = Math.max(0, Number((profile as { points?: number } | null)?.points ?? 0));

  let ledger: ReturnType<typeof normalizeLedgerRow>[] = [];
  const ledgerRes = await sb
    .from("point_ledger")
    .select(POINT_LEDGER_ROW_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!ledgerRes.error) {
    ledger = (ledgerRes.data ?? []).map((row) =>
      normalizeLedgerRow(row as Record<string, unknown>, userId, userNickname)
    );
  } else if (!isMissingPointsTable(ledgerRes.error.message ?? "", "point_ledger")) {
    return NextResponse.json({ ok: false, error: ledgerRes.error.message }, { status: 500 });
  }

  let chargeRequests: ReturnType<typeof normalizeChargeRequest>[] = [];
  const chargeRes = await sb
    .from("point_charge_requests")
    .select(POINT_CHARGE_REQUEST_ROW_SELECT)
    .eq("user_id", userId)
    .order("requested_at", { ascending: false })
    .limit(20);
  if (!chargeRes.error) {
    chargeRequests = (chargeRes.data ?? []).map((row) =>
      normalizeChargeRequest(row as Record<string, unknown>, userId, userNickname)
    );
  } else if (!isMissingPointsTable(chargeRes.error.message ?? "", "point_charge_requests")) {
    return NextResponse.json({ ok: false, error: chargeRes.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, balance, ledger, chargeRequests, source: "supabase" });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const userId = id?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: { delta?: number; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const delta = Number(body.delta);
  const reason = String(body.reason ?? "").trim();
  if (!Number.isFinite(delta) || delta === 0) {
    return NextResponse.json({ ok: false, error: "invalid_delta" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }

  const { sb, actor } = gate;
  const current = await readUserPointBalance(sb, userId);
  const adjusted = await adjustUserPoints(sb, {
    userId,
    delta,
    description: reason,
    actorUserId: actor.userId,
  });
  if (!adjusted.ok) {
    const status =
      adjusted.code === "insufficient_balance"
        ? 400
        : adjusted.error === "user_not_found"
          ? 404
          : adjusted.error === "invalid_input"
            ? 400
            : 500;
    return NextResponse.json({ ok: false, error: adjusted.error }, { status });
  }

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actor.userId,
    target_type: "user_points",
    target_id: userId,
    action: "admin_point_adjust",
    before_json: { balance: current },
    after_json: { balance: adjusted.balanceAfter, delta, reason },
  });

  return NextResponse.json({ ok: true, balance: adjusted.balanceAfter });
}
