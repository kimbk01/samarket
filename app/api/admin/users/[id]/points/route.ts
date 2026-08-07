import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  POINT_CHARGE_REQUEST_ROW_SELECT,
} from "@/lib/points/point-query-select";
import {
  isMissingPointsTable,
  normalizeChargeRequest,
} from "@/lib/points/admin-user-points-shared";
import type { PointFinancialFilter } from "@/lib/points/point-financial-history";
import {
  loadPointFinancialHistory,
  loadPointFinancialSummary,
  serializePointFinancialPage,
} from "@/lib/points/project-point-financial-history";
import {
  adjustUserPoints,
  readUserPointBalance,
  reconcileUserPointBalance,
} from "@/lib/points/user-point-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseFilter(raw: string | null): PointFinancialFilter {
  const v = (raw ?? "all").trim().toLowerCase();
  if (v === "credit" || v === "debit") return v;
  return "all";
}

export async function GET(
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

  const { sb } = gate;
  const { data: profile } = await sb
    .from("profiles")
    .select("nickname, points")
    .eq("id", userId)
    .maybeSingle();
  const userNickname = String((profile as { nickname?: string } | null)?.nickname ?? "");

  const filter = parseFilter(req.nextUrl.searchParams.get("filter"));
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 40);
  const cursor = req.nextUrl.searchParams.get("cursor");
  const dateFrom = req.nextUrl.searchParams.get("dateFrom");
  const dateTo = req.nextUrl.searchParams.get("dateTo");

  const summary = await loadPointFinancialSummary(sb, userId);
  const historyRes = await loadPointFinancialHistory(sb, {
    userId,
    filter,
    limit,
    cursor,
    dateFrom,
    dateTo,
  });
  if (!historyRes.ok) {
    if (historyRes.code === "table_missing") {
      return NextResponse.json({
        ok: true,
        balance: summary.balance,
        summary,
        history: { items: [], hasMore: false, nextCursor: null },
        ledger: [],
        chargeRequests: [],
        source: "missing_table",
      });
    }
    return NextResponse.json({ ok: false, error: historyRes.error }, { status: 500 });
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

  const history = serializePointFinancialPage(historyRes.page);

  return NextResponse.json({
    ok: true,
    balance: summary.balance,
    ledgerSum: summary.ledgerSum,
    cacheMatchesLedger: summary.cacheMatchesLedger,
    summary,
    history,
    ledger: history.items.map((item) => ({
      id: item.ledgerId,
      userId,
      userNickname,
      entryType: item.entryType,
      amount: item.signedAmount,
      balanceAfter: item.balanceAfter,
      relatedType: item.relatedType,
      relatedId: item.relatedId,
      description: item.description,
      createdAt: item.occurredAt,
      actorType: item.actorType,
    })),
    chargeRequests,
    source: "supabase",
  });
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

/** Soft repair: project profiles.points from ledger SUM when mismatched. */
export async function POST(
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

  let body: { reconcile?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (body.reconcile !== true) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const { sb, actor } = gate;
  const res = await reconcileUserPointBalance(sb, userId);
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  }

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actor.userId,
    target_type: "user_points",
    target_id: userId,
    action: "admin_point_reconcile",
    before_json: { balance: res.cacheBefore, ledgerSum: res.ledgerSum },
    after_json: { balance: res.cacheAfter, repaired: res.repaired },
  });

  return NextResponse.json({
    ok: true,
    repaired: res.repaired,
    cacheBefore: res.cacheBefore,
    ledgerSum: res.ledgerSum,
    balance: res.cacheAfter,
  });
}
