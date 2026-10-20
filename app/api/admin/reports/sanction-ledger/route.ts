import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { adminListRange, escapeAdminIlike } from "@/lib/admin/pagination/parse-admin-list-page";
import {
  parseSanctionLedgerQuery,
  type AdminSanctionLedgerRow,
} from "@/lib/admin-reports/admin-sanction-ledger-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActionRow = {
  id: string;
  report_id: string;
  action_type: string;
  action_note: string | null;
  created_by: string | null;
  created_at: string;
};

type ReportRow = {
  id: string;
  target_type: string | null;
  target_id: string | null;
  reporter_id: string | null;
  reason_code: string | null;
  reason_text: string | null;
  status: string | null;
  resolved_at: string | null;
};

/**
 * GET /api/admin/reports/sanction-ledger — 제재 기록 (report_actions + reports), 서버 페이지네이션.
 * 권한 = 회원·권한 워크스페이스 `users` 키 (설계 v4 권한 표). query: from/to(PHT 날짜) · action_type · q(대상 회원 닉네임/UUID)
 * · limit(20/50/100) · offset. 응답 `{ ok, rows, total, limit, offset }` (total = exact).
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminPermission("users");
  if (!admin.ok) return admin.response;
  const { sb } = admin;
  const parsed = parseSanctionLedgerQuery(req.nextUrl.searchParams);
  const { page } = parsed;
  const empty = () => NextResponse.json({ ok: true, rows: [], total: 0, limit: page.limit, offset: page.offset });

  try {
    // 대상 회원 검색 → 대상 id → 그 대상의 신고 id.
    let reportIds: string[] | null = null;
    if (parsed.target) {
      let targetIds: string[] = [];
      if (parsed.target.kind === "id") targetIds = [parsed.target.id];
      else {
        const { data: hits } = await sb
          .from("profiles")
          .select("id")
          .ilike("nickname", `%${escapeAdminIlike(parsed.target.text)}%`)
          .limit(200);
        targetIds = ((hits ?? []) as { id?: string }[]).map((p) => String(p.id ?? "")).filter(Boolean);
      }
      if (targetIds.length === 0) return empty();
      const { data: reps, error: repErr } = await sb.from("reports").select("id").in("target_id", targetIds).limit(1000);
      if (repErr) throw new Error(repErr.message);
      reportIds = ((reps ?? []) as { id: string }[]).map((r) => r.id);
      if (reportIds.length === 0) return empty();
    }

    const [from, to] = adminListRange(page);
    let q = sb
      .from("report_actions")
      .select("id, report_id, action_type, action_note, created_by, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
    if (parsed.actionType) q = q.eq("action_type", parsed.actionType);
    if (parsed.fromIso) q = q.gte("created_at", parsed.fromIso);
    if (parsed.toIso) q = q.lt("created_at", parsed.toIso);
    if (reportIds) q = q.in("report_id", reportIds);
    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    const actions = (data ?? []) as ActionRow[];

    const repIds = [...new Set(actions.map((a) => a.report_id))];
    const reportById = new Map<string, ReportRow>();
    if (repIds.length) {
      const { data: reps } = await sb
        .from("reports")
        .select("id, target_type, target_id, reporter_id, reason_code, reason_text, status, resolved_at")
        .in("id", repIds);
      for (const r of (reps ?? []) as ReportRow[]) reportById.set(r.id, r);
    }

    const profileIds = new Set<string>();
    for (const a of actions) if (a.created_by) profileIds.add(a.created_by);
    for (const r of reportById.values()) if (r.target_type === "user" && r.target_id) profileIds.add(r.target_id);
    const nickById = new Map<string, string>();
    if (profileIds.size) {
      const { data: profiles } = await sb.from("profiles").select("id, nickname").in("id", [...profileIds]);
      for (const p of (profiles ?? []) as { id: string; nickname: string | null }[]) {
        if (p.nickname) nickById.set(String(p.id), p.nickname);
      }
    }

    const rows: AdminSanctionLedgerRow[] = actions.map((a) => {
      const r = reportById.get(a.report_id);
      const targetId = r?.target_id ?? "";
      return {
        action_id: a.id,
        report_id: a.report_id,
        action_type: a.action_type,
        action_note: a.action_note,
        admin_id: a.created_by,
        admin_nickname: a.created_by ? nickById.get(a.created_by) ?? null : null,
        action_at: a.created_at,
        target_type: r?.target_type ?? "",
        target_id: targetId,
        target_nickname: r?.target_type === "user" ? nickById.get(targetId) ?? null : null,
        reporter_id: r?.reporter_id ?? "",
        reason_code: r?.reason_code ?? "",
        reason_text: r?.reason_text ?? null,
        report_status: r?.status ?? "",
        resolved_at: r?.resolved_at ?? null,
      };
    });

    return NextResponse.json({ ok: true, rows, total: count ?? rows.length, limit: page.limit, offset: page.offset });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "sanction_ledger_load_failed" },
      { status: 500 }
    );
  }
}
