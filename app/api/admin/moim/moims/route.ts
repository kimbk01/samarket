/**
 * GET /api/admin/moim/moims — 모임 목록 (설계 moim §8 「모임 목록」). 권한 키 `moim`.
 * query: tab=all|normal|unlisted|warned|blocked|closed|deleted · lgu · category · from/to(PHT 개설일) · reports(신고 수 하한)
 *        · activity=7d|30d|idle30|idle90 · q(모임 이름·모임장 닉네임/DIBAY ID·모임 id) · limit(≤100) · offset · facets=1
 *        · format=csv → 같은 조건 전체(최대 5,000행) CSV, 내보내기 감사 기록(audit_logs `moim.csv_export`)을 남긴다.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import {
  MOIM_ADMIN_ACTIVITY_FILTERS,
  MOIM_ADMIN_LIST_TABS,
  pickEnum,
  type MoimAdminActivityFilter,
} from "@/lib/admin/moim/moim-admin-contract";
import {
  listAdminMoims,
  loadAdminMoimFacets,
  manilaDateRangeIso,
  parseMoimAdminPage,
  sanitizeMoimAdminSearch,
  type MoimAdminListFilter,
} from "@/lib/admin/moim/moim-admin-queries.server";
import { moimAdminUuid } from "@/lib/admin/moim/moim-admin-route.server";
import { parseCommunityAdminPeriodFromSearch } from "@/lib/admin/community-admin/community-admin-period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CSV_MAX_ROWS = 5_000;

function csvCell(v: unknown): string {
  const t = v == null ? "" : String(v);
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

function parseFilter(sp: URLSearchParams): MoimAdminListFilter | null {
  const { limit, offset } = parseMoimAdminPage(sp);
  // 개설일: from/to(PHT) 또는 대시보드 링크의 period=7d 등
  let createdFromIso: string | null = null;
  let createdToIso: string | null = null;
  if (sp.get("from") || sp.get("to")) {
    const r = manilaDateRangeIso(sp.get("from"), sp.get("to"));
    createdFromIso = r.fromIso;
    createdToIso = r.toIso;
  } else if (sp.get("period")) {
    const p = parseCommunityAdminPeriodFromSearch(sp, { defaultPeriod: "all" });
    if (!p.ok) return null;
    createdFromIso = p.fromIso;
    createdToIso = p.toIso;
  }
  const minRaw = Math.floor(Number(sp.get("reports")));
  const activityRaw = sp.get("activity");
  return {
    tab: pickEnum(MOIM_ADMIN_LIST_TABS, sp.get("tab"), "all"),
    lguId: (sp.get("lgu") ?? "").trim().slice(0, 80) || null,
    categoryId: moimAdminUuid(sp.get("category")),
    createdFromIso,
    createdToIso,
    minReports: Number.isFinite(minRaw) && minRaw > 0 ? Math.min(minRaw, 1000) : null,
    activity: (MOIM_ADMIN_ACTIVITY_FILTERS as readonly string[]).includes(activityRaw ?? "") ? (activityRaw as MoimAdminActivityFilter) : null,
    q: sanitizeMoimAdminSearch(sp.get("q")),
    limit,
    offset,
  };
}

export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("moim");
  if (!gate.ok) return gate.response;
  const sp = req.nextUrl.searchParams;
  const filter = parseFilter(sp);
  if (!filter) return NextResponse.json({ ok: false, error: "invalid_period" }, { status: 400 });

  if (sp.get("format") === "csv") {
    const header = ["moim_id", "name", "status", "platform_state", "category", "lgu", "members", "capacity", "host_nickname", "host_dibay_id", "reports", "last_activity_at", "created_at"];
    const lines = [header.join(",")];
    let exported = 0;
    for (let offset = 0; offset < CSV_MAX_ROWS; offset += 100) {
      const page = await listAdminMoims(gate.sb, { ...filter, limit: 100, offset });
      if (!page.ok) return NextResponse.json({ ok: false, error: page.error }, { status: 500 });
      for (const r of page.rows) {
        lines.push(
          [r.id, r.name, r.status, r.platformState, r.categoryLabelKo ?? "", r.lguLabel ?? r.lguId, r.memberCount, r.capacity ?? "", r.host?.nickname ?? "", r.host?.dibayId ?? "", r.reportCount, r.lastActivityAt, r.createdAt]
            .map(csvCell)
            .join(",")
        );
      }
      exported += page.rows.length;
      if (page.rows.length < 100) break;
    }
    const audit = await appendCommunityAdminAudit(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "moim",
      targetId: "moim_list_csv",
      action: "moim.csv_export",
      after: { rows: exported, filter: { ...filter, limit: undefined, offset: undefined } },
    });
    // 감사 기록을 남기지 못하면 내보내지 않는다 (설계 §8 「CSV 내보내기는 감사 기록을 남긴다」)
    if (!audit.ok) return NextResponse.json({ ok: false, error: "audit_failed" }, { status: 500 });
    return new NextResponse("﻿" + lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="moims-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const [list, facets] = await Promise.all([
    listAdminMoims(gate.sb, filter),
    sp.get("facets") === "1" ? loadAdminMoimFacets(gate.sb) : Promise.resolve(null),
  ]);
  if (!list.ok) return NextResponse.json({ ok: false, error: list.error }, { status: 500 });
  return NextResponse.json({ ok: true, total: list.total, rows: list.rows, facets, limit: filter.limit, offset: filter.offset });
}
