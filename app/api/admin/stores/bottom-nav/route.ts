import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { DELIVERY_BOTTOM_NAV_SERVER_CACHE_TAG } from "@/lib/delivery/load-delivery-bottom-nav-items-server";
import {
  ADMIN_EXPECTED_UPDATED_AT_REQUIRED,
  ADMIN_STALE_UPDATED_AT,
  readExpectedUpdatedAt,
  sameUpdatedAtInstant,
} from "@/lib/admin/concurrency/admin-expected-updated-at";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Patch = Partial<{
  label: string;
  icon_key: string;
  href: string;
  sort_order: number;
  is_active: boolean;
  is_center: boolean;
  requires_store_id: boolean;
  color: string;
}>;

async function requireAdmin() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { data, error } = await sb
    .from("delivery_bottom_nav_items")
    .select("id,label,icon_key,href,sort_order,is_active,is_center,requires_store_id,color,created_at,updated_at")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    if (error.message?.includes("delivery_bottom_nav_items") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[GET admin stores bottom-nav]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const, items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const patch: Patch = {
    label: typeof b.label === "string" ? b.label : "",
    icon_key: typeof b.icon_key === "string" ? b.icon_key : "",
    href: typeof b.href === "string" ? b.href : "",
    sort_order: typeof b.sort_order === "number" ? b.sort_order : 0,
    is_active: typeof b.is_active === "boolean" ? b.is_active : true,
    is_center: typeof b.is_center === "boolean" ? b.is_center : false,
    /** 배달 하단의 「내매장」은 앱에서 소유 매장 유무로만 제어 — 어드민에서 분기하지 않음 */
    requires_store_id: false,
    color: typeof b.color === "string" && b.color ? b.color : "#0B421A",
  };

  if (!patch.label || !patch.icon_key || !patch.href) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  try {
    if (patch.is_center) {
      // Best-effort: clear existing center first. DB partial unique index is the final guard.
      await sb.from("delivery_bottom_nav_items").update({ is_center: false }).eq("is_center", true);
    }

    const { data, error } = await sb
      .from("delivery_bottom_nav_items")
      .insert(patch)
      .select("id,label,icon_key,href,sort_order,is_active,is_center,requires_store_id,color,created_at,updated_at")
      .single();

    if (error) {
      console.error("[POST admin stores bottom-nav]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    revalidateTag(DELIVERY_BOTTOM_NAV_SERVER_CACHE_TAG, { expire: 0 });
    await appendAdminRouteAudit(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "delivery_bottom_nav_item",
      targetId: String((data as { id?: unknown } | null)?.id ?? ""),
      action: "delivery_bottom_nav.create",
      after: (data ?? null) as Record<string, unknown> | null,
    });
    return NextResponse.json({ ok: true as const, item: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown_error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id : "";
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const patch: Patch = {};
  for (const k of ["label", "icon_key", "href", "sort_order", "is_active", "is_center", "color"] as const) {
    if (b[k] !== undefined) (patch as any)[k] = b[k] as any;
  }

  // CAS — 화면이 본 항목 updated_at (테이블 updated_at 트리거 존재). 없으면 400, 다르면 409.
  const expectedUpdatedAt = readExpectedUpdatedAt(b.expected_updated_at);
  if (!expectedUpdatedAt) {
    return NextResponse.json({ ok: false, error: ADMIN_EXPECTED_UPDATED_AT_REQUIRED }, { status: 400 });
  }

  try {
    const cur = await sb
      .from("delivery_bottom_nav_items")
      .select("id,label,icon_key,href,sort_order,is_active,is_center,requires_store_id,color,created_at,updated_at")
      .eq("id", id)
      .maybeSingle();
    if (cur.error) {
      console.error("[PUT admin stores bottom-nav load]", cur.error);
      return NextResponse.json({ ok: false, error: cur.error.message }, { status: 500 });
    }
    if (!cur.data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const before = cur.data as Record<string, unknown>;
    const currentUpdatedAt = typeof before.updated_at === "string" ? before.updated_at : null;
    if (!currentUpdatedAt || !sameUpdatedAtInstant(expectedUpdatedAt, currentUpdatedAt)) {
      return NextResponse.json({ ok: false, error: ADMIN_STALE_UPDATED_AT }, { status: 409 });
    }

    /** 중앙 지정: 기존 중앙 해제(부분 unique 인덱스) — CAS 실패 시 되돌리기 위해 해제한 id 를 기억한다. */
    let clearedCenterIds: string[] = [];
    if (patch.is_center === true) {
      const cleared = await sb
        .from("delivery_bottom_nav_items")
        .update({ is_center: false })
        .eq("is_center", true)
        .neq("id", id)
        .select("id");
      clearedCenterIds = ((cleared.data ?? []) as Array<{ id?: unknown }>)
        .map((r) => String(r.id ?? ""))
        .filter(Boolean);
    }

    (patch as Patch).requires_store_id = false;

    const { data, error } = await sb
      .from("delivery_bottom_nav_items")
      .update(patch)
      .eq("id", id)
      .eq("updated_at", currentUpdatedAt)
      .select("id,label,icon_key,href,sort_order,is_active,is_center,requires_store_id,color,created_at,updated_at")
      .maybeSingle();

    if (error || !data) {
      if (clearedCenterIds.length > 0) {
        const restore = await sb.from("delivery_bottom_nav_items").update({ is_center: true }).in("id", clearedCenterIds);
        if (restore.error) console.error("[PUT admin stores bottom-nav center restore]", restore.error);
        revalidateTag(DELIVERY_BOTTOM_NAV_SERVER_CACHE_TAG, { expire: 0 });
      }
      if (error) {
        console.error("[PUT admin stores bottom-nav]", error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      // 조건부 UPDATE 0행 — 확인 직후 다른 관리자가 먼저 저장(또는 삭제).
      return NextResponse.json({ ok: false, error: ADMIN_STALE_UPDATED_AT }, { status: 409 });
    }

    revalidateTag(DELIVERY_BOTTOM_NAV_SERVER_CACHE_TAG, { expire: 0 });
    await appendAdminRouteAudit(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "delivery_bottom_nav_item",
      targetId: id,
      action: "delivery_bottom_nav.update",
      before,
      after: { patch, item: data as Record<string, unknown> },
    });
    return NextResponse.json({ ok: true as const, item: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown_error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const { error } = await sb.from("delivery_bottom_nav_items").delete().eq("id", id);
  if (error) {
    console.error("[DELETE admin stores bottom-nav]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  revalidateTag(DELIVERY_BOTTOM_NAV_SERVER_CACHE_TAG, { expire: 0 });
  await appendAdminRouteAudit(gate.sb, req, {
    actorId: gate.actor.userId,
    targetType: "delivery_bottom_nav_item",
    targetId: id,
    action: "delivery_bottom_nav.delete",
  });
  return NextResponse.json({ ok: true as const });
}


/**
 * 순서 변경 1회 처리 (DEF-44): 두 항목의 sort_order 를 한 요청에서 교환.
 * 각 UPDATE 는 화면 로드 시점 sort_order 조건(CAS)으로 실행하고, 두 번째가 실패하면 서버가 첫 번째를 되돌린다.
 * 감사 기록 1건 (`delivery_bottom_nav.reorder`).
 */
export async function PATCH(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = ((await req.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (body.action !== "swap_order") {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }
  const aId = typeof body.a_id === "string" ? body.a_id.trim() : "";
  const bId = typeof body.b_id === "string" ? body.b_id.trim() : "";
  const aSort = Number(body.a_sort_order);
  const bSort = Number(body.b_sort_order);
  if (!aId || !bId || aId === bId || !Number.isInteger(aSort) || !Number.isInteger(bSort)) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const first = await sb
    .from("delivery_bottom_nav_items")
    .update({ sort_order: bSort })
    .eq("id", aId)
    .eq("sort_order", aSort)
    .select("id")
    .maybeSingle();
  if (first.error) {
    console.error("[PATCH admin stores bottom-nav swap a]", first.error);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
  if (!first.data) return NextResponse.json({ ok: false, error: "stale_updated_at" }, { status: 409 });

  const second = await sb
    .from("delivery_bottom_nav_items")
    .update({ sort_order: aSort })
    .eq("id", bId)
    .eq("sort_order", bSort)
    .select("id")
    .maybeSingle();
  if (second.error || !second.data) {
    const revert = await sb
      .from("delivery_bottom_nav_items")
      .update({ sort_order: aSort })
      .eq("id", aId)
      .eq("sort_order", bSort);
    if (revert.error) console.error("[PATCH admin stores bottom-nav swap revert]", revert.error);
    revalidateTag(DELIVERY_BOTTOM_NAV_SERVER_CACHE_TAG, { expire: 0 });
    return NextResponse.json(
      { ok: false, error: second.error ? "update_failed" : "stale_updated_at", reverted: !revert.error },
      { status: second.error ? 500 : 409 }
    );
  }

  revalidateTag(DELIVERY_BOTTOM_NAV_SERVER_CACHE_TAG, { expire: 0 });
  await appendAdminRouteAudit(gate.sb, req, {
    actorId: gate.actor.userId,
    targetType: "delivery_bottom_nav_item",
    targetId: aId,
    action: "delivery_bottom_nav.reorder",
    before: { [aId]: aSort, [bId]: bSort },
    after: { [aId]: bSort, [bId]: aSort },
  });
  return NextResponse.json({ ok: true as const });
}
