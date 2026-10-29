import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { adminListRange, escapeAdminIlike } from "@/lib/admin/pagination/parse-admin-list-page";
import {
  parseSanctionLedgerCursor,
  parseSanctionLedgerQuery,
} from "@/lib/admin-reports/admin-sanction-ledger-query";
import {
  enrichReportActionLedgerRows,
  loadSanctionLedgerCursorPage,
} from "@/lib/admin-reports/admin-sanction-ledger-unified.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reports/sanction-ledger — 제재 기록 (report_actions + reports), 서버 페이지네이션.
 * 권한 = 회원·권한 워크스페이스 `users` 키 (설계 v4 권한 표). query: from/to(PHT 날짜) · action_type · q(대상 회원 닉네임/UUID)
 * · limit(20/50/100) · offset. 응답 `{ ok, rows, total, limit, offset }` (total = exact).
 * 커서 모드 (`cursor` 파라미터 — 첫 쪽은 빈 값, RS-02): report_actions + sanctions(기능 제한·경고) + user_moderation_events
 * (계정 정지·차단·복구) 3원장을 원장별 page+1 건으로 병합 (조회 전용). 응답 = 위 필드 + `nextCursor` · `sourceCounts` ·
 * `includedSources` · `excludedSources` · `partial`. sanctions 는 scope 별 도메인 화면 열람 권한이 있을 때만 포함.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminPermission("users");
  if (!admin.ok) return admin.response;
  const { sb } = admin;
  const parsed = parseSanctionLedgerQuery(req.nextUrl.searchParams);
  const { page } = parsed;
  const { cursorMode, cursor } = parseSanctionLedgerCursor(req.nextUrl.searchParams);
  const empty = () => NextResponse.json({ ok: true, rows: [], total: 0, limit: page.limit, offset: page.offset });

  try {
    // 대상 회원 검색 → 대상 id → 그 대상의 신고 id.
    let reportIds: string[] | null = null;
    let targetIdsFilter: string[] | null = null;
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
      targetIdsFilter = targetIds;
      const { data: reps, error: repErr } = await sb.from("reports").select("id").in("target_id", targetIds).limit(1000);
      if (repErr) throw new Error(repErr.message);
      reportIds = ((reps ?? []) as { id: string }[]).map((r) => r.id);
      // 커서 모드는 신고가 없어도 대상 회원의 기능 제한·계정 조치가 있을 수 있다
      if (reportIds.length === 0 && !cursorMode) return empty();
    }

    if (cursorMode) {
      const result = await loadSanctionLedgerCursorPage(sb, parsed, cursor, admin.actor, {
        targetIds: targetIdsFilter,
        reportIds,
      });
      return NextResponse.json({ ok: true, ...result });
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
    const { rows } = await enrichReportActionLedgerRows(
      sb,
      (data ?? []) as Parameters<typeof enrichReportActionLedgerRows>[1]
    );

    return NextResponse.json({ ok: true, rows, total: count ?? rows.length, limit: page.limit, offset: page.offset });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "sanction_ledger_load_failed" },
      { status: 500 }
    );
  }
}
