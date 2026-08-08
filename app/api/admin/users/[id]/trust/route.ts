/**
 * GET /api/admin/users/:id/trust — Admin Trust Projection
 * Read authority: member_trust_snapshots (+ bridge profiles.trust_score).
 * History SSOT: trust_events (legacy reputation_logs fallback during migration).
 * Does NOT write — adjust remains POST /api/admin/trust-score.
 */
import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  ADMIN_TRUST_HISTORY_LIMIT,
  ADMIN_TRUST_HISTORY_ORDER_ASCENDING,
  filterAdminTrustHistoryRows,
  filterAdminTrustEventRows,
} from "@/lib/trust/admin-trust-history";
import { clampTrustScore, TRUST_SCORE_DEFAULT } from "@/lib/trust/trust-score-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_SELECT = "id, user_id, source_type, source_id, delta, status, reason, created_at";
const EVENT_SELECT =
  "id, member_id, domain, event_type, source_type, source_id, direction, status, occurred_at, metadata";

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

  let trustScore = TRUST_SCORE_DEFAULT;
  let policyVersion: string | null = null;
  let source: string = "profiles.trust_score_bridge";

  const { data: snap } = await sb
    .from("member_trust_snapshots")
    .select("manner_battery_percent, policy_version")
    .eq("member_id", userId)
    .maybeSingle();

  if (snap && (snap as { manner_battery_percent?: number }).manner_battery_percent != null) {
    trustScore = clampTrustScore(Number((snap as { manner_battery_percent: number }).manner_battery_percent));
    policyVersion = String((snap as { policy_version?: string }).policy_version ?? "");
    source = "member_trust_snapshots";
  } else {
    const rawTs = (profile as { trust_score?: number | null }).trust_score;
    trustScore =
      rawTs != null && Number.isFinite(Number(rawTs))
        ? clampTrustScore(Number(rawTs))
        : TRUST_SCORE_DEFAULT;
  }

  const eventsRes = await sb
    .from("trust_events")
    .select(EVENT_SELECT)
    .eq("member_id", userId)
    .order("occurred_at", { ascending: ADMIN_TRUST_HISTORY_ORDER_ASCENDING })
    .limit(ADMIN_TRUST_HISTORY_LIMIT);

  if (!eventsRes.error && (eventsRes.data?.length ?? 0) > 0) {
    const history = filterAdminTrustEventRows(
      (eventsRes.data ?? []) as Record<string, unknown>[],
      userId,
    );
    return NextResponse.json({
      ok: true,
      userId,
      trustScore,
      policyVersion,
      history,
      historyLimit: ADMIN_TRUST_HISTORY_LIMIT,
      historyOrder: "occurred_at_desc",
      source,
      historySource: "trust_events",
    });
  }

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
    policyVersion,
    history,
    historyLimit: ADMIN_TRUST_HISTORY_LIMIT,
    historyOrder: "created_at_desc",
    source,
    historySource: "reputation_logs_legacy_fallback",
  });
}
