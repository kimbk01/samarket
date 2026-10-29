import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";
import { loadStoreTaxonomyRows } from "@/lib/stores/load-store-taxonomy-rows";
import { loadDeliveryMenusAdmin } from "@/lib/stores/delivery-menus/load-delivery-menus.server";
import { isDeliveryMenuSlug } from "@/lib/stores/delivery-menus/delivery-menu-types";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { internalErrorResponse } from "@/lib/security/internal-error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WP2 — 어드민 「메뉴 구성」 API (`/admin/delivery-screens` 메뉴 구성 탭).
 * 메뉴는 고객 화면 구성만 바꾼다 — 업종·수수료·매장 데이터는 건드리지 않는다.
 */

const MAX_STORES = 3000;

function cleanText(v: unknown, max: number): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t.slice(0, max) : null;
}

function cleanIso(v: unknown): string | null {
  if (v == null || v === "") return null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function cleanIdList(v: unknown): string[] | null {
  if (v == null) return null;
  if (!Array.isArray(v)) return null;
  return [...new Set(v.map((x) => String(x ?? "").trim()).filter(Boolean))].slice(0, 500);
}

/** DB 트리거 오류 → 어드민 문구 코드 */
function mapDbError(message: string): string | null {
  if (/delivery_menu_scope_mismatch/.test(message)) return "scope_mismatch";
  if (/delivery_menu_depth_exceeded/.test(message)) return "depth_exceeded";
  if (/delivery_menus_slug_uniq|duplicate key/.test(message)) return "slug_taken";
  if (/delivery_menus_primary_uniq/.test(message)) return "primary_taken";
  return null;
}

/** 조회는 화면(`/admin/delivery-screens`, 관리자 전체)과 같은 가드 — 쓰기는 아래에서 `business` 권한 */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  try {
    const [menus, taxonomy, storesRes] = await Promise.all([
      loadDeliveryMenusAdmin(sb),
      loadStoreTaxonomyRows(sb, { activeOnly: false }),
      sb
        .from("stores")
        .select("id, store_name, store_category_id, store_topic_id, is_visible, approval_status, store_kind")
        .order("store_name", { ascending: true })
        .limit(MAX_STORES),
    ]);
    if (storesRes.error) throw storesRes.error;
    return NextResponse.json({
      ok: true,
      /** null = 메뉴 테이블 미적용 (고객 화면은 업종 그대로) */
      menus,
      categories: taxonomy.categories,
      topics: taxonomy.topics,
      stores: storesRes.data ?? [],
    });
  } catch (e) {
    return internalErrorResponse("load_failed", "[/api/admin/stores/delivery-menus GET]", e, 500);
  }
}

export async function POST(req: Request) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parentId = cleanText(body?.parent_id, 64);
  const primaryCategoryId = parentId ? null : cleanText(body?.primary_category_id, 64);
  const slug = (cleanText(body?.slug, 63) ?? "").toLowerCase();
  const nameKo = cleanText(body?.name_ko, 60);
  const nameEn = cleanText(body?.name_en, 60);
  if (!nameKo || !isDeliveryMenuSlug(slug) || (!parentId && !primaryCategoryId)) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const sortOrder = Number.isFinite(Number(body?.sort_order)) ? Math.floor(Number(body?.sort_order)) : 0;

  const { data, error } = await sb
    .from("delivery_menus")
    .insert({
      parent_id: parentId,
      primary_category_id: primaryCategoryId,
      slug,
      name_ko: nameKo,
      name_en: nameEn,
      sort_order: sortOrder,
      is_active: true,
      show_on_home: false,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    const code = mapDbError(error.message ?? "");
    if (code) return NextResponse.json({ ok: false, error: code }, { status: 409 });
    return internalErrorResponse("save_failed", "[/api/admin/stores/delivery-menus POST]", error, 500);
  }
  bumpStorePublicSharedCacheGeneration("delivery_menus.create");
  await appendAdminRouteAudit(gate.sb, req, {
    actorId: gate.actor.userId,
    targetType: "delivery_menus",
    targetId: String((data as { id?: string } | null)?.id ?? ""),
    action: "delivery_menus.create",
    after: { parent_id: parentId, primary_category_id: primaryCategoryId, slug, name_ko: nameKo },
  });
  return NextResponse.json({ ok: true, id: (data as { id?: string } | null)?.id ?? null });
}

const PATCH_KEYS = new Set([
  "name_ko",
  "name_en",
  "is_active",
  "show_on_home",
  "home_sort_order",
  "sort_order",
  "start_at",
  "end_at",
]);

/**
 * PATCH JSON
 * - 단일 수정: { id, patch?, topic_ids?, include_store_ids?, exclude_store_ids? } — 목록 3종은 보낸 것만 통째 교체
 * - 순서 일괄: { order: [{ id, sort_order }] } 또는 { home_order: [{ id, home_sort_order }] }
 */
export async function PATCH(req: Request) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const orderKey = Array.isArray(body.order) ? "sort_order" : Array.isArray(body.home_order) ? "home_sort_order" : null;
  if (orderKey) {
    const list = (orderKey === "sort_order" ? body.order : body.home_order) as Array<Record<string, unknown>>;
    for (const item of list.slice(0, 500)) {
      const id = cleanText(item?.id, 64);
      const value = Math.floor(Number(item?.[orderKey]));
      if (!id || !Number.isFinite(value)) continue;
      const { error } = await sb.from("delivery_menus").update({ [orderKey]: value }).eq("id", id);
      if (error) return internalErrorResponse("save_failed", "[/api/admin/stores/delivery-menus PATCH order]", error, 500);
    }
    bumpStorePublicSharedCacheGeneration("delivery_menus.reorder");
    await appendAdminRouteAudit(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "delivery_menus",
      targetId: "",
      action: "delivery_menus.reorder",
      after: { key: orderKey, count: list.length },
    });
    return NextResponse.json({ ok: true });
  }

  const id = cleanText(body.id, 64);
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const patchIn = (body.patch && typeof body.patch === "object" ? body.patch : {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patchIn)) {
    if (!PATCH_KEYS.has(k)) continue;
    if (k === "name_ko") {
      const name = cleanText(v, 60);
      if (!name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
      patch[k] = name;
    } else if (k === "name_en") patch[k] = cleanText(v, 60);
    else if (k === "is_active" || k === "show_on_home") patch[k] = v === true;
    else if (k === "sort_order" || k === "home_sort_order") patch[k] = Math.floor(Number(v)) || 0;
    else patch[k] = cleanIso(v);
  }
  const topicIds = cleanIdList(body.topic_ids);
  const includeIds = cleanIdList(body.include_store_ids);
  const excludeIds = cleanIdList(body.exclude_store_ids);

  const { data: before, error: beforeErr } = await sb
    .from("delivery_menus")
    .select("id, parent_id, name_ko, is_active")
    .eq("id", id)
    .maybeSingle();
  if (beforeErr) return internalErrorResponse("load_failed", "[/api/admin/stores/delivery-menus PATCH]", beforeErr, 500);
  if (!before) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const isChild = (before as { parent_id: string | null }).parent_id != null;
  if (!isChild && (topicIds || includeIds || excludeIds)) {
    return NextResponse.json({ ok: false, error: "sources_child_only" }, { status: 400 });
  }
  if (includeIds && excludeIds && includeIds.some((x) => excludeIds.includes(x))) {
    return NextResponse.json({ ok: false, error: "include_exclude_overlap" }, { status: 400 });
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await sb.from("delivery_menus").update(patch).eq("id", id);
    if (error) {
      const code = mapDbError(error.message ?? "");
      if (code) return NextResponse.json({ ok: false, error: code }, { status: 409 });
      return internalErrorResponse("save_failed", "[/api/admin/stores/delivery-menus PATCH]", error, 500);
    }
  }
  if (topicIds) {
    const del = await sb.from("delivery_menu_sources").delete().eq("menu_id", id);
    if (del.error) return internalErrorResponse("save_failed", "[/api/admin/stores/delivery-menus sources]", del.error, 500);
    if (topicIds.length > 0) {
      const ins = await sb.from("delivery_menu_sources").insert(topicIds.map((topic_id) => ({ menu_id: id, topic_id })));
      if (ins.error) {
        const code = mapDbError(ins.error.message ?? "");
        if (code) return NextResponse.json({ ok: false, error: code }, { status: 409 });
        return internalErrorResponse("save_failed", "[/api/admin/stores/delivery-menus sources]", ins.error, 500);
      }
    }
  }
  if (includeIds || excludeIds) {
    const modes: Array<["include" | "exclude", string[] | null]> = [
      ["include", includeIds],
      ["exclude", excludeIds],
    ];
    for (const [mode, ids] of modes) {
      if (!ids) continue;
      const del = await sb.from("delivery_menu_store_overrides").delete().eq("menu_id", id).eq("mode", mode);
      if (del.error) return internalErrorResponse("save_failed", "[/api/admin/stores/delivery-menus overrides]", del.error, 500);
      if (ids.length > 0) {
        const ins = await sb
          .from("delivery_menu_store_overrides")
          .upsert(ids.map((store_id) => ({ menu_id: id, store_id, mode })), { onConflict: "menu_id,store_id" });
        if (ins.error) {
          const code = mapDbError(ins.error.message ?? "");
          if (code) return NextResponse.json({ ok: false, error: code }, { status: 409 });
          return internalErrorResponse("save_failed", "[/api/admin/stores/delivery-menus overrides]", ins.error, 500);
        }
      }
    }
  }

  bumpStorePublicSharedCacheGeneration("delivery_menus.update");
  await appendAdminRouteAudit(gate.sb, req, {
    actorId: gate.actor.userId,
    targetType: "delivery_menus",
    targetId: id,
    action: "delivery_menus.update",
    before: before as Record<string, unknown>,
    after: { patch, topic_ids: topicIds, include_store_ids: includeIds, exclude_store_ids: excludeIds },
  });
  return NextResponse.json({ ok: true });
}

/** DELETE ?id= — 메뉴만 삭제(2단은 함께). 매장·업종·수수료는 그대로 */
export async function DELETE(req: Request) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const id = cleanText(new URL(req.url).searchParams.get("id"), 64);
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const { data: before } = await sb
    .from("delivery_menus")
    .select("id, parent_id, slug, name_ko")
    .eq("id", id)
    .maybeSingle();
  if (!before) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const { error } = await sb.from("delivery_menus").delete().eq("id", id);
  if (error) return internalErrorResponse("delete_failed", "[/api/admin/stores/delivery-menus DELETE]", error, 500);
  bumpStorePublicSharedCacheGeneration("delivery_menus.delete");
  await appendAdminRouteAudit(gate.sb, req, {
    actorId: gate.actor.userId,
    targetType: "delivery_menus",
    targetId: id,
    action: "delivery_menus.delete",
    before: before as Record<string, unknown>,
  });
  return NextResponse.json({ ok: true });
}
