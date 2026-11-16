/**
 * 허위·악의 신고 판정 — CREW REP S4 (Owner 2026-11-16 「S4 진행해」, 설계 §4.4-2).
 *
 * GET    /api/admin/users/:id/false-reports  — 이 회원이 신고자인 「반려·기각」 신고(4종) + 이미 내린 판정
 * POST   { reportKind, reportId, reason }    — 허위·악의 신고로 판정 → 신고자 매너 −2 (manner_false_report)
 * DELETE { eventId, reason }                 — 판정 취소 (원장 되돌림)
 *
 * 반려·기각만으로는 신고자 점수가 바뀌지 않는다. 운영자가 「허위·악의」로 판정한 것만 반영한다.
 * 기록 시작(CREW_REP_MANNER_START_ISO) 이후 결정된 신고만 판정할 수 있다.
 */
import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
import { CREW_REP_MANNER_START_ISO, buildCrewRepEventIdempotencyKey } from "@/lib/trust/crew-rep-policy";
import { recordTrustEvent, reverseTrustEvent } from "@/lib/trust/trust-event-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALSE_REPORT_KINDS = ["trade", "community", "chat", "moim"] as const;
type FalseReportKind = (typeof FALSE_REPORT_KINDS)[number];

type ReportDef = {
  table: string;
  reporterCol: string;
  rejectedStatus: string;
  decidedCol: string;
  reasonCol: string;
  targetCols: string;
};

const REPORT_DEFS: Record<FalseReportKind, ReportDef> = {
  trade: { table: "reports", reporterCol: "reporter_id", rejectedStatus: "rejected", decidedCol: "resolved_at", reasonCol: "reason_code", targetCols: "target_type, target_id" },
  community: { table: "community_reports", reporterCol: "user_id", rejectedStatus: "dismissed", decidedCol: "processed_at", reasonCol: "reason", targetCols: "target_type, target_id" },
  chat: { table: "chat_reports", reporterCol: "reporter_user_id", rejectedStatus: "dismissed", decidedCol: "updated_at", reasonCol: "reason_type", targetCols: "report_type, reported_user_id" },
  moim: { table: "moim_reports", reporterCol: "reporter_id", rejectedStatus: "dismissed", decidedCol: "handled_at", reasonCol: "reason_code", targetCols: "target_type, target_id" },
};

type Sb = import("@supabase/supabase-js").SupabaseClient<any>;

export type AdminFalseReportCandidate = {
  reportKind: FalseReportKind;
  reportId: string;
  reason: string | null;
  targetType: string | null;
  decidedAt: string | null;
  createdAt: string | null;
  /** 이미 내린 허위 판정 (confirmed 원장 사건 id) */
  falseReportEventId: string | null;
};

async function loadCandidates(sb: Sb, userId: string): Promise<AdminFalseReportCandidate[]> {
  const out: AdminFalseReportCandidate[] = [];
  for (const kind of FALSE_REPORT_KINDS) {
    const d = REPORT_DEFS[kind];
    const { data, error } = await sb
      .from(d.table)
      .select(`id, ${d.reasonCol}, ${d.decidedCol}, created_at, ${d.targetCols}`)
      .eq(d.reporterCol, userId)
      .eq("status", d.rejectedStatus)
      .gte(d.decidedCol, CREW_REP_MANNER_START_ISO)
      .order(d.decidedCol, { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      out.push({
        reportKind: kind,
        reportId: String(row.id),
        reason: row[d.reasonCol] != null ? String(row[d.reasonCol]) : null,
        targetType: row.target_type != null ? String(row.target_type) : row.report_type != null ? String(row.report_type) : null,
        decidedAt: row[d.decidedCol] != null ? String(row[d.decidedCol]) : null,
        createdAt: row.created_at != null ? String(row.created_at) : null,
        falseReportEventId: null,
      });
    }
  }
  const { data: events, error: evErr } = await sb
    .from("trust_events")
    .select("id, source_id")
    .eq("member_id", userId)
    .eq("event_type", "manner_false_report")
    .eq("status", "confirmed");
  if (evErr) throw new Error(evErr.message);
  const bySource = new Map(((events ?? []) as { id: string; source_id: string }[]).map((e) => [e.source_id, e.id]));
  for (const c of out) c.falseReportEventId = bySource.get(c.reportId) ?? null;
  return out.sort((a, b) => String(b.decidedAt ?? "").localeCompare(String(a.decidedAt ?? "")));
}

async function paramUserId(params: Promise<{ id: string }>): Promise<string | null> {
  const { id } = await params;
  const v = id?.trim();
  return v ? v : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;
  const userId = await paramUserId(params);
  if (!userId) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  try {
    const items = await loadCandidates(gate.sb as Sb, userId);
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("[admin false-reports GET]", e);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;
  const userId = await paramUserId(params);
  if (!userId) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = String(body?.reportKind ?? "") as FalseReportKind;
  const reportId = String(body?.reportId ?? "").trim();
  if (!(FALSE_REPORT_KINDS as readonly string[]).includes(kind) || !reportId) {
    return NextResponse.json({ ok: false, error: "invalid_report" }, { status: 400 });
  }
  const reason = parseAdminReason(body?.reason);
  if (!reason) return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });

  const sb = gate.sb as Sb;
  const d = REPORT_DEFS[kind];
  const { data: rep, error } = await sb
    .from(d.table)
    .select(`id, status, ${d.reporterCol}, ${d.decidedCol}`)
    .eq("id", reportId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  const row = rep as Record<string, unknown> | null;
  if (!row) return NextResponse.json({ ok: false, error: "report_not_found" }, { status: 404 });
  if (String(row[d.reporterCol] ?? "") !== userId) {
    return NextResponse.json({ ok: false, error: "reporter_mismatch" }, { status: 409 });
  }
  if (row.status !== d.rejectedStatus) {
    return NextResponse.json({ ok: false, error: "report_not_rejected" }, { status: 409 });
  }
  const decidedAt = row[d.decidedCol] != null ? String(row[d.decidedCol]) : null;
  if (!decidedAt || new Date(decidedAt).getTime() < new Date(CREW_REP_MANNER_START_ISO).getTime()) {
    return NextResponse.json({ ok: false, error: "report_before_crew_rep_start" }, { status: 409 });
  }

  const actorId = gate.actor.userId;
  const result = await recordTrustEvent(sb, {
    memberId: userId,
    domain: kind === "trade" ? "trade" : "community",
    eventType: "manner_false_report",
    sourceType: `false_report_${kind}`,
    sourceId: reportId,
    idempotencyKey: buildCrewRepEventIdempotencyKey("manner_false_report", reportId, userId),
    direction: "negative",
    severity: "medium",
    occurredAt: new Date().toISOString(),
    metadata: { report_kind: kind, reason, operator_id: actorId, report_decided_at: decidedAt },
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  if (!result.inserted) {
    return NextResponse.json({ ok: false, error: "already_decided", eventId: result.eventId }, { status: 409 });
  }
  await appendAdminRouteAudit(sb, req, {
    actorId,
    targetType: "member_trust",
    targetId: userId,
    action: "member_trust.false_report_decided",
    after: { reportKind: kind, reportId, reason, eventId: result.eventId },
  });
  return NextResponse.json({ ok: true, eventId: result.eventId });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;
  const userId = await paramUserId(params);
  if (!userId) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const eventId = String(body?.eventId ?? "").trim();
  const reason = parseAdminReason(body?.reason);
  if (!eventId) return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });
  if (!reason) return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });

  const sb = gate.sb as Sb;
  const { data: ev, error } = await sb
    .from("trust_events")
    .select("id, member_id, event_type, status")
    .eq("id", eventId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  const row = ev as { member_id: string; event_type: string; status: string } | null;
  if (!row || row.member_id !== userId || row.event_type !== "manner_false_report") {
    return NextResponse.json({ ok: false, error: "event_not_found" }, { status: 404 });
  }
  if (row.status !== "confirmed") return NextResponse.json({ ok: false, error: "already_revoked" }, { status: 409 });

  const r = await reverseTrustEvent(sb, eventId, `false_report_revoked: ${reason}`);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error ?? "revoke_failed" }, { status: 500 });
  await appendAdminRouteAudit(sb, req, {
    actorId: gate.actor.userId,
    targetType: "member_trust",
    targetId: userId,
    action: "member_trust.false_report_revoked",
    after: { eventId, reason },
  });
  return NextResponse.json({ ok: true });
}
