/**
 * GET /api/admin/users/:id/trust — Admin Trust Projection (Slice 7)
 * Returns profiles.trust_score + recent reputation_logs (history SSOT).
 * Does NOT write trust_score — adjust remains POST /api/admin/trust-score (Slice 1 writer).
 */
import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  ADMIN_TRUST_HISTORY_LIMIT,
  ADMIN_TRUST_HISTORY_ORDER_ASCENDING,
  filterAdminTrustHistoryRows,
} from "@/lib/trust/admin-trust-history";
import { clampTrustScore, TRUST_SCORE_DEFAULT } from "@/lib/trust/trust-score-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_SELECT = "id, user_id, source_type, source_id, delta, status, reason, created_at";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const userId = id?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const { sb } = gate;

  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("id, trust_score")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr) {
    return NextResponse.json({ ok: false, error: profileErr.message }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
  }

  const rawTs = (profile as { trust_score?: number | null }).trust_score;
  const trustScore =
    rawTs != null && Number.isFinite(Number(rawTs))
      ? clampTrustScore(Number(rawTs))
      : TRUST_SCORE_DEFAULT;

  const logsRes = await sb
    .from("reputation_logs")
    .select(LOG_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: ADMIN_TRUST_HISTORY_ORDER_ASCENDING })
    .limit(ADMIN_TRUST_HISTORY_LIMIT);

  if (logsRes.error) {
    return NextResponse.json(
      {
        ok: false,
        error: logsRes.error.message,
        trustScore,
        history: [] as unknown[],
        historyLimit: ADMIN_TRUST_HISTORY_LIMIT,
      },
      { status: 500 },
    );
  }

  const history = filterAdminTrustHistoryRows(
    (logsRes.data ?? []) as Record<string, unknown>[],
    userId,
  );

  return NextResponse.json({
    ok: true,
    userId,
    trustScore,
    history,
    historyLimit: ADMIN_TRUST_HISTORY_LIMIT,
    historyOrder: "created_at_desc",
    source: "profiles.trust_score+reputation_logs",
  });
}
