import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiActor } from "@/lib/admin/require-admin-permission";
import { isAdminAdDeleteKind } from "@/lib/admin/access/admin-ads-authority";
import type { AdminAdDeletedRow } from "@/lib/admin/ads-delete/admin-ad-delete-contract";
import { normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { ADMIN_LIST_MAX_OFFSET } from "@/lib/admin/pagination/parse-admin-list-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ads/deleted?limit=&offset= — 이력 「삭제됨」 목록 (R2 · 2026-11-07)
 * 조회 권한 = 광고 이력 화면과 같은 활성 관리자 전원. 삭제 취소 권한은 행마다 화면이 권한 표로 판단하고 서버가 다시 막는다.
 * → { ok, total, rows: [{ kind, id, title, deletedAt, deletedBy, deleteReason }] }
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdminApiActor();
  if (!gate.ok) return gate.response;
  const sp = req.nextUrl.searchParams;
  const limit = normalizeAdminListPageSize(sp.get("limit"));
  const offsetRaw = Math.floor(Number(sp.get("offset") ?? 0));
  const offset = Number.isFinite(offsetRaw) ? Math.min(Math.max(offsetRaw, 0), ADMIN_LIST_MAX_OFFSET) : 0;
  const { data, error } = await gate.sb.rpc("admin_ads_deleted_rows", { p_limit: limit, p_offset: offset });
  if (error) {
    console.error("[admin/ads/deleted] rpc failed", error.message);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
  const out = (data ?? {}) as { ok?: boolean; total?: number; rows?: Array<Record<string, unknown>> };
  if (out.ok !== true) return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  const rows: AdminAdDeletedRow[] = (out.rows ?? [])
    .filter((r) => isAdminAdDeleteKind(r.kind))
    .map((r) => ({
      kind: r.kind as AdminAdDeletedRow["kind"],
      id: String(r.id ?? ""),
      title: typeof r.title === "string" && r.title.trim() ? r.title : null,
      deletedAt: typeof r.deleted_at === "string" ? r.deleted_at : null,
      deletedBy: typeof r.deleted_by === "string" ? r.deleted_by : null,
      deleteReason: typeof r.delete_reason === "string" ? r.delete_reason : null,
    }));
  return NextResponse.json({ ok: true, total: Number(out.total ?? rows.length), rows, limit, offset });
}
