import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";
import { resolveDefaultMenuIdForStore } from "@/lib/stores/delivery-menus/delivery-menu-compute";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { internalErrorResponse } from "@/lib/security/internal-error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 안전장치 S2 — 매장 상세·입점 심사의 「노출 메뉴」 (메뉴 관리 매장 지정과 같은 데이터).
 * GET: 매장 목록 메뉴 전체 + 이 매장 지정 메뉴 + 업종 기본 메뉴 (미지정이면 화면이 미리 체크).
 * PUT { menu_ids }: 이 매장의 메뉴를 통째 교체. 노출 매장은 0개로 만들 수 없다.
 */
export async function GET(_req: Request, ctx: Ctx) {
  if (!(await isRouteAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  try {
    const [storeRes, menusRes, assignRes, defaultsRes] = await Promise.all([
      sb.from("stores").select("id, store_category_id, store_topic_id").eq("id", id).maybeSingle(),
      sb.from("delivery_menus").select("id, parent_id, name_ko, sort_order, link_target, is_active").order("sort_order"),
      sb.from("delivery_menu_store_overrides").select("menu_id").eq("store_id", id).eq("mode", "include"),
      sb.from("delivery_menu_defaults").select("category_id, topic_id, menu_id"),
    ]);
    const err = storeRes.error ?? menusRes.error ?? assignRes.error ?? defaultsRes.error;
    if (err) {
      if (/42P01|does not exist/i.test(err.message ?? "")) return NextResponse.json({ ok: true, unavailable: true });
      throw err;
    }
    if (!storeRes.data) return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
    const rows = (menusRes.data ?? []) as {
      id: string;
      parent_id: string | null;
      name_ko: string;
      sort_order: number | null;
      link_target: string | null;
      is_active: boolean | null;
    }[];
    const roots = rows.filter((m) => m.parent_id == null);
    const menus = rows
      .filter((m) => m.parent_id != null && !m.link_target)
      .map((m) => ({ id: m.id, name_ko: m.name_ko, root_name: roots.find((r) => r.id === m.parent_id)?.name_ko ?? "" }));
    const store = storeRes.data as { id: string; store_category_id: string | null; store_topic_id: string | null };
    return NextResponse.json({
      ok: true,
      menus,
      assigned: ((assignRes.data ?? []) as { menu_id: string }[]).map((r) => String(r.menu_id)),
      default_menu_id: resolveDefaultMenuIdForStore(
        (defaultsRes.data ?? []) as { category_id: string; topic_id: string | null; menu_id: string }[],
        store
      ),
    });
  } catch (e) {
    return internalErrorResponse("load_failed", "[/api/admin/stores/[id]/delivery-menus GET]", e, 500);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { menu_ids?: unknown } | null;
  if (!Array.isArray(body?.menu_ids)) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const menuIds = [...new Set(body.menu_ids.map((x) => String(x ?? "").trim()).filter(Boolean))].slice(0, 100);

  const [storeRes, currentRes] = await Promise.all([
    sb.from("stores").select("id, approval_status, is_visible").eq("id", id).maybeSingle(),
    sb.from("delivery_menu_store_overrides").select("menu_id").eq("store_id", id).eq("mode", "include"),
  ]);
  if (storeRes.error || currentRes.error) {
    return internalErrorResponse("load_failed", "[/api/admin/stores/[id]/delivery-menus PUT]", storeRes.error ?? currentRes.error, 500);
  }
  const store = storeRes.data as { approval_status: string | null; is_visible: boolean | null } | null;
  if (!store) return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
  if (menuIds.length === 0 && store.approval_status === "approved" && store.is_visible === true) {
    return NextResponse.json({ ok: false, error: "delivery_menu_required" }, { status: 409 });
  }
  const before = ((currentRes.data ?? []) as { menu_id: string }[]).map((r) => String(r.menu_id));
  const removed = before.filter((m) => !menuIds.includes(m));
  if (menuIds.length) {
    const up = await sb.from("delivery_menu_store_overrides").upsert(
      menuIds.map((menuId) => ({ menu_id: menuId, store_id: id, mode: "include", sort_order: 900 })),
      { onConflict: "menu_id,store_id", ignoreDuplicates: true }
    );
    if (up.error) {
      if (/requires_child_menu/.test(up.error.message ?? "")) {
        return NextResponse.json({ ok: false, error: "requires_child" }, { status: 409 });
      }
      return internalErrorResponse("save_failed", "[/api/admin/stores/[id]/delivery-menus PUT upsert]", up.error, 500);
    }
  }
  if (removed.length) {
    const del = await sb.from("delivery_menu_store_overrides").delete().eq("store_id", id).in("menu_id", removed);
    if (del.error) {
      if (/delivery_menu_last_assignment/.test(del.error.message ?? "")) {
        return NextResponse.json({ ok: false, error: "delivery_menu_required" }, { status: 409 });
      }
      return internalErrorResponse("save_failed", "[/api/admin/stores/[id]/delivery-menus PUT delete]", del.error, 500);
    }
  }
  bumpStorePublicSharedCacheGeneration("admin_store.delivery_menus");
  await appendAdminRouteAudit(gate.sb, req, {
    actorId: gate.actor.userId,
    targetType: "store",
    targetId: id,
    action: "store.delivery_menus",
    before: { menu_ids: before },
    after: { menu_ids: menuIds },
  });
  return NextResponse.json({ ok: true });
}
