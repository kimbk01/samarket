import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { loadBusinessControlCenterDetail } from "@/lib/admin-business/load-business-control-center-detail";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  executeAdminStorePatchAction,
  type AdminStorePatchBody,
} from "@/lib/admin-business/execute-admin-store-patch-action.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id: storeId } = await context.params;
  const id = typeof storeId === "string" ? storeId.trim() : "";
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const detail = await loadBusinessControlCenterDetail(sb, id);
  if (!detail.ok) {
    if (detail.error === "store_not_found") {
      return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
    }
    return NextResponse.json(
      { ok: false, error: detail.message ?? "load_failed" },
      { status: 500 }
    );
  }

  const ownerNickname = detail.owner.displayLabel;
  return NextResponse.json({
    ok: true,
    store: {
      ...detail.store,
      applicant_nickname:
        String(detail.store.applicant_nickname ?? "").trim() || ownerNickname,
      owner_username: detail.owner.username,
      owner_handle: detail.owner.handle,
      sales_permission: detail.salesPermission,
    },
    ownerNickname,
    owner: detail.owner,
    salesPermission: detail.salesPermission,
    stats: detail.stats,
    kpi: detail.kpi,
    fee: detail.fee,
    delivery: detail.delivery,
    ops: detail.ops,
    logs: detail.logs,
  });
}

/**
 * Admin store command PATCH — action-gated; not a free-form row update.
 * Fee override / distance override live on separate SSOT APIs (see admin-store-patch-commands).
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // 매장 결정·설정 쓰기 = `business`(매장·배달) 권한 — 조회(GET)는 관리자 전체.
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const { id: storeId } = await context.params;
  const id = typeof storeId === "string" ? storeId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  let body: AdminStorePatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const actorId = (await getRouteUserId()) ?? gate.actor.userId;
  return executeAdminStorePatchAction({
    id,
    body,
    actorId,
    requestMeta: getAuditRequestMeta(req),
  });
}
