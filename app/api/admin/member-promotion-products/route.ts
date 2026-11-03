/**
 * 어드민 › 상위노출 가격 (Owner 2026-11-03 「1번부터 시작」).
 * GET  — 상품(꺼진 것 포함) · 변경 내역 최근 50건 · 상품별 진행 중 주문 수
 * PATCH — { id, expectedRevision, pointCost, durationDays, isActive, reason }
 *   → `admin_update_member_promotion_product` (값·revision·변경 내역 한 트랜잭션, revision 다르면 409 덮어쓰기 없음)
 * 이미 신청한 주문에는 적용되지 않는다 — 주문 행의 금액·기간만 쓰고, 이 API 는 주문을 고치지 않는다.
 */
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { isMissingPointsTable } from "@/lib/points/admin-user-points-shared";
import {
  loadMemberPromotionProducts,
  MEMBER_PROMOTION_PRODUCTS_TABLE,
} from "@/lib/points/member-promotion-products-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHANGES_TABLE = "member_promotion_product_changes";

export type AdminMemberPromotionProductChange = {
  id: string;
  productId: string;
  changedAt: string;
  adminId: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string;
};

async function loadSnapshot(sb: SupabaseClient) {
  const products = await loadMemberPromotionProducts(sb, { includeInactive: true });
  const migrated = products.some((p) => p.source === "db");

  let changes: AdminMemberPromotionProductChange[] = [];
  if (migrated) {
    const { data, error } = await sb
      .from(CHANGES_TABLE)
      .select("id, product_id, changed_at, admin_id, before, after, reason")
      .order("changed_at", { ascending: false })
      .limit(50);
    if (error && !isMissingPointsTable(error.message ?? "", CHANGES_TABLE)) throw new Error(error.message);
    changes = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id ?? ""),
      productId: String(r.product_id ?? ""),
      changedAt: String(r.changed_at ?? ""),
      adminId: r.admin_id ? String(r.admin_id) : null,
      before: (r.before ?? {}) as Record<string, unknown>,
      after: (r.after ?? {}) as Record<string, unknown>,
      reason: String(r.reason ?? ""),
    }));
  }

  /** 진행 중 주문 수 (산 당시 가격 유지 — 읽기만) */
  const { data: activeRows } = await sb
    .from("point_promotion_orders")
    .select("product_id")
    .eq("order_status", "active")
    .gte("end_at", new Date().toISOString())
    .limit(2000);
  const activeCounts: Record<string, number> = {};
  for (const r of (activeRows ?? []) as { product_id?: string | null }[]) {
    const id = String(r.product_id ?? "").trim();
    if (id) activeCounts[id] = (activeCounts[id] ?? 0) + 1;
  }

  /** 변경 내역의 관리자 표시 이름 */
  const adminIds = [...new Set(changes.map((c) => c.adminId).filter((v): v is string => Boolean(v)))];
  const adminNames: Record<string, string> = {};
  if (adminIds.length > 0) {
    const { data: profs } = await sb.from("profiles").select("id, nickname").in("id", adminIds);
    for (const p of (profs ?? []) as { id: string; nickname?: string | null }[]) {
      const nick = String(p.nickname ?? "").trim();
      if (nick) adminNames[p.id] = nick;
    }
  }

  return {
    migrated,
    products: products.map((p) => ({
      id: p.id,
      domain: p.domain,
      durationDays: p.durationDays,
      pointCost: p.pointCost,
      isActive: p.active,
      revision: p.revision,
      updatedAt: p.updatedAt,
      fallbackTitleKo: p.fallbackTitleKo,
      fallbackTitleEn: p.fallbackTitleEn,
    })),
    changes,
    activeCounts,
    adminNames,
  };
}

export async function GET() {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, ...(await loadSnapshot(sb)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let body: {
    id?: string;
    expectedRevision?: number;
    pointCost?: number;
    durationDays?: number;
    isActive?: boolean;
    reason?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const { data, error } = await sb.rpc("admin_update_member_promotion_product", {
    p_id: id,
    p_expected_revision: Math.floor(Number(body.expectedRevision)),
    p_point_cost: Math.floor(Number(body.pointCost)),
    p_duration_days: Math.floor(Number(body.durationDays)),
    p_is_active: typeof body.isActive === "boolean" ? body.isActive : null,
    p_reason: String(body.reason ?? ""),
    p_admin_id: admin.userId,
  });
  if (error) {
    const msg = error.message ?? "";
    if (
      msg.includes("admin_update_member_promotion_product") ||
      msg.includes("Could not find the function") ||
      isMissingPointsTable(msg, MEMBER_PROMOTION_PRODUCTS_TABLE)
    ) {
      return NextResponse.json({ ok: false, error: "migration_required" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
  const res = (data ?? {}) as { ok?: boolean; error?: string; before?: Record<string, unknown>; after?: Record<string, unknown> };
  if (!res.ok) {
    const err = res.error ?? "update_failed";
    const status =
      err === "revision_conflict" ? 409 : err === "not_found" ? 404 : err === "forbidden" ? 403 : 400;
    const snapshot = err === "revision_conflict" ? await loadSnapshot(sb).catch(() => null) : null;
    return NextResponse.json({ ok: false, error: err, ...(snapshot ?? {}) }, { status });
  }

  await appendAdminRouteAudit(sb, req, {
    actorId: admin.userId,
    targetType: "member_promotion_product",
    targetId: id,
    action: "member_promotion_product.update",
    before: res.before ?? null,
    after: { ...(res.after ?? {}), reason: String(body.reason ?? "").trim() },
  });

  try {
    return NextResponse.json({ ok: true, ...(await loadSnapshot(sb)) });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
