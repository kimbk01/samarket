import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";
import { loadStoreTaxonomyRows } from "@/lib/stores/load-store-taxonomy-rows";
import { loadDeliveryMenusAdmin } from "@/lib/stores/delivery-menus/load-delivery-menus.server";
import { isDeliveryMenuLinkTarget, isDeliveryMenuSlug } from "@/lib/stores/delivery-menus/delivery-menu-types";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { internalErrorResponse } from "@/lib/security/internal-error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 배민 미러링 — 어드민 「배달·매장 › 메뉴 관리」 API (`/admin/delivery-menus`).
 * 메뉴는 고객 화면 구성만 바꾼다 — 업종·수수료·매장 데이터는 건드리지 않는다.
 * 안전장치: 노출 매장의 마지막 메뉴 빼기·매장 남은 메뉴 삭제는 거부 (DB 트리거가 최종 방어선).
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
  if (!Array.isArray(v)) return null;
  return [...new Set(v.map((x) => String(x ?? "").trim()).filter(Boolean))].slice(0, 1000);
}

/** DB 트리거·제약 오류 → 어드민 문구 코드 */
function mapDbError(message: string): string | null {
  if (/delivery_menu_last_assignment/.test(message)) return "last_assignment";
  if (/delivery_menu_has_stores/.test(message)) return "has_stores";
  if (/delivery_menu_is_default|delivery_menu_defaults_menu_id_fkey/.test(message)) return "is_default";
  if (/delivery_menu_assignment_requires_child_menu/.test(message)) return "requires_child";
  if (/delivery_menu_depth_exceeded/.test(message)) return "depth_exceeded";
  if (/delivery_menus_slug_uniq|duplicate key/.test(message)) return "slug_taken";
  if (/delivery_menus_feature_bg_chk/.test(message)) return "bad_color";
  if (/delivery_menus_link_target_chk/.test(message)) return "bad_link";
  return null;
}

function dbErrorResponse(where: string, error: { message?: string } | null) {
  const code = mapDbError(error?.message ?? "");
  if (code) return NextResponse.json({ ok: false, error: code }, { status: 409 });
  return internalErrorResponse("save_failed", `[/api/admin/stores/delivery-menus ${where}]`, error, 500);
}

type StoreRow = {
  id: string;
  store_name: string | null;
  slug: string | null;
  profile_image_url: string | null;
  store_category_id: string | null;
  store_topic_id: string | null;
  is_visible: boolean | null;
  approval_status: string | null;
  pickup_available: boolean | null;
};

/** 조회는 화면(`/admin/delivery-menus`, 관리자 전체)과 같은 가드 — 쓰기는 아래에서 `business` 권한 */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  try {
    const [snapshot, taxonomy, storesRes] = await Promise.all([
      loadDeliveryMenusAdmin(sb),
      loadStoreTaxonomyRows(sb, { activeOnly: false }),
      sb
        .from("stores")
        .select(
          "id, store_name, slug, profile_image_url, store_category_id, store_topic_id, is_visible, approval_status, pickup_available"
        )
        .order("store_name", { ascending: true })
        .limit(MAX_STORES),
    ]);
    if (storesRes.error) throw storesRes.error;
    return NextResponse.json({
      ok: true,
      /** null = 메뉴 테이블 미적용 (고객 화면은 업종 그대로) */
      snapshot,
      categories: taxonomy.categories,
      topics: taxonomy.topics,
      stores: (storesRes.data ?? []) as StoreRow[],
    });
  } catch (e) {
    return internalErrorResponse("load_failed", "[/api/admin/stores/delivery-menus GET]", e, 500);
  }
}

/** POST { parent_id?: string|null, name_ko, name_en? } — 상단 탭(1단) 또는 메뉴(2단) 추가, 맨 뒤 순서 */
export async function POST(req: Request) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parentId = cleanText(body?.parent_id, 64);
  const nameKo = cleanText(body?.name_ko, 60);
  const nameEn = cleanText(body?.name_en, 60);
  const requested = (cleanText(body?.slug, 63) ?? "").toLowerCase();
  const slug = requested && isDeliveryMenuSlug(requested) ? requested : `m-${randomUUID().slice(0, 8)}`;
  if (!nameKo) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const siblings = parentId
    ? await sb.from("delivery_menus").select("sort_order, home_sort_order").eq("parent_id", parentId)
    : await sb.from("delivery_menus").select("sort_order, home_sort_order").is("parent_id", null);
  if (siblings.error) return dbErrorResponse("POST siblings", siblings.error);
  const rows = (siblings.data ?? []) as { sort_order: number | null; home_sort_order: number | null }[];
  const nextSort = rows.reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0) + 1;
  const nextHome = rows.reduce((m, r) => Math.max(m, r.home_sort_order ?? 0), 0) + 1;

  const { data, error } = await sb
    .from("delivery_menus")
    .insert({
      parent_id: parentId,
      slug,
      name_ko: nameKo,
      name_en: nameEn,
      sort_order: nextSort,
      home_sort_order: nextHome,
      is_active: true,
      show_on_home: true,
      show_in_page_tab: true,
    })
    .select("id")
    .maybeSingle();
  if (error) return dbErrorResponse("POST", error);
  const id = String((data as { id?: string } | null)?.id ?? "");
  bumpStorePublicSharedCacheGeneration("delivery_menus.create");
  await appendAdminRouteAudit(gate.sb, req, {
    actorId: gate.actor.userId,
    targetType: "delivery_menus",
    targetId: id,
    action: "delivery_menus.create",
    after: { parent_id: parentId, slug, name_ko: nameKo },
  });
  return NextResponse.json({ ok: true, id });
}

const PATCH_TEXT_KEYS: Record<string, number> = {
  name_ko: 60,
  name_en: 60,
  badge_text: 16,
  feature_title: 60,
};
const PATCH_BOOL_KEYS = new Set(["is_active", "show_on_home", "show_in_page_tab", "pickup_only", "show_feature"]);

/**
 * PATCH JSON (한 번에 하나)
 * - { id, patch } — 이름·표시·연결 화면·대표 카드·배지·기간·상단 탭 이동(parent_id)
 * - { order: [{ id, sort_order }] } / { home_order: [{ id, home_sort_order }] }
 * - { id, store_ids } — 2단 메뉴 매장 지정 통째 교체(순서 포함). 노출 매장의 마지막 메뉴 빼기는 거부(store_ids 응답)
 * - { root_id, shortcuts: [{ store_id, caption }] } — 매장 바로가기 줄 통째 교체
 * - { defaults: [{ category_id, topic_id, menu_id }] } — 업종 기본 메뉴 (S1)
 */
export async function PATCH(req: Request) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  for (const orderKey of ["order", "home_order"] as const) {
    if (!Array.isArray(body[orderKey])) continue;
    const column = orderKey === "order" ? "sort_order" : "home_sort_order";
    const list = (body[orderKey] as Record<string, unknown>[])
      .map((o) => ({ id: cleanText(o?.id, 64), value: Math.floor(Number(o?.[column])) }))
      .filter((o): o is { id: string; value: number } => !!o.id && Number.isFinite(o.value))
      .slice(0, 300);
    for (const o of list) {
      const { error } = await sb.from("delivery_menus").update({ [column]: o.value }).eq("id", o.id);
      if (error) return dbErrorResponse("PATCH order", error);
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

  if (Array.isArray(body.defaults)) {
    const list = (body.defaults as Record<string, unknown>[])
      .map((d) => ({
        category_id: cleanText(d?.category_id, 64),
        topic_id: cleanText(d?.topic_id, 64),
        menu_id: cleanText(d?.menu_id, 64),
      }))
      .filter((d): d is { category_id: string; topic_id: string | null; menu_id: string } => !!d.category_id && !!d.menu_id)
      .slice(0, 500);
    for (const d of list) {
      const { error } = await sb
        .from("delivery_menu_defaults")
        .upsert(d, { onConflict: "category_id,topic_id" });
      if (error) return dbErrorResponse("PATCH defaults", error);
    }
    bumpStorePublicSharedCacheGeneration("delivery_menus.defaults");
    await appendAdminRouteAudit(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "delivery_menu_defaults",
      targetId: "",
      action: "delivery_menus.defaults",
      after: { count: list.length },
    });
    return NextResponse.json({ ok: true });
  }

  const rootId = cleanText(body.root_id, 64);
  if (rootId && Array.isArray(body.shortcuts)) {
    const seen = new Set<string>();
    const rows = (body.shortcuts as Record<string, unknown>[])
      .map((s, i) => ({
        root_menu_id: rootId,
        store_id: cleanText(s?.store_id, 64) ?? "",
        caption: cleanText(s?.caption, 16),
        sort_order: i + 1,
      }))
      .filter((s) => s.store_id && !seen.has(s.store_id) && seen.add(s.store_id))
      .slice(0, 30);
    const del = await sb.from("delivery_menu_shortcuts").delete().eq("root_menu_id", rootId);
    if (del.error) return dbErrorResponse("PATCH shortcuts delete", del.error);
    if (rows.length) {
      const ins = await sb.from("delivery_menu_shortcuts").insert(rows);
      if (ins.error) return dbErrorResponse("PATCH shortcuts insert", ins.error);
    }
    bumpStorePublicSharedCacheGeneration("delivery_menus.shortcuts");
    await appendAdminRouteAudit(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "delivery_menus",
      targetId: rootId,
      action: "delivery_menus.shortcuts",
      after: { count: rows.length },
    });
    return NextResponse.json({ ok: true });
  }

  const id = cleanText(body.id, 64);
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const storeIds = cleanIdList(body.store_ids);
  if (storeIds) {
    const current = await sb
      .from("delivery_menu_store_overrides")
      .select("store_id")
      .eq("menu_id", id)
      .eq("mode", "include");
    if (current.error) return dbErrorResponse("PATCH stores current", current.error);
    const before = new Set(((current.data ?? []) as { store_id: string }[]).map((r) => String(r.store_id)));
    const removed = [...before].filter((sid) => !storeIds.includes(sid));

    /** S5 — 빼려는 매장이 다른 메뉴에 없고 노출 중이면 거부 (옮길 메뉴를 먼저 지정) */
    if (removed.length) {
      const [others, visible] = await Promise.all([
        sb
          .from("delivery_menu_store_overrides")
          .select("store_id")
          .in("store_id", removed)
          .eq("mode", "include")
          .neq("menu_id", id),
        sb.from("stores").select("id").in("id", removed).eq("approval_status", "approved").eq("is_visible", true),
      ]);
      if (others.error) return dbErrorResponse("PATCH stores others", others.error);
      if (visible.error) return dbErrorResponse("PATCH stores visible", visible.error);
      const elsewhere = new Set(((others.data ?? []) as { store_id: string }[]).map((r) => String(r.store_id)));
      const blocked = ((visible.data ?? []) as { id: string }[])
        .map((r) => String(r.id))
        .filter((sid) => !elsewhere.has(sid));
      if (blocked.length) {
        return NextResponse.json({ ok: false, error: "last_assignment", store_ids: blocked }, { status: 409 });
      }
    }

    if (storeIds.length) {
      const up = await sb.from("delivery_menu_store_overrides").upsert(
        storeIds.map((sid, i) => ({ menu_id: id, store_id: sid, mode: "include", sort_order: i + 1 })),
        { onConflict: "menu_id,store_id" }
      );
      if (up.error) return dbErrorResponse("PATCH stores upsert", up.error);
    }
    if (removed.length) {
      const del = await sb.from("delivery_menu_store_overrides").delete().eq("menu_id", id).in("store_id", removed);
      if (del.error) return dbErrorResponse("PATCH stores delete", del.error);
    }
    bumpStorePublicSharedCacheGeneration("delivery_menus.stores");
    await appendAdminRouteAudit(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "delivery_menus",
      targetId: id,
      action: "delivery_menus.stores",
      before: { count: before.size },
      after: { count: storeIds.length, removed: removed.length },
    });
    return NextResponse.json({ ok: true });
  }

  const raw = (body.patch ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const [k, max] of Object.entries(PATCH_TEXT_KEYS)) {
    if (k in raw) patch[k] = cleanText(raw[k], max);
  }
  if ("name_ko" in patch && !patch.name_ko) {
    return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
  }
  for (const k of PATCH_BOOL_KEYS) {
    if (k in raw) patch[k] = raw[k] === true;
  }
  for (const k of ["link_target", "feature_link_target"] as const) {
    if (k in raw) {
      if (raw[k] == null || raw[k] === "") patch[k] = null;
      else if (isDeliveryMenuLinkTarget(raw[k])) patch[k] = raw[k];
      else return NextResponse.json({ ok: false, error: "bad_link" }, { status: 400 });
    }
  }
  if ("feature_bg" in raw) {
    const bg = cleanText(raw.feature_bg, 7);
    if (bg && !/^#[0-9A-Fa-f]{6}$/.test(bg)) return NextResponse.json({ ok: false, error: "bad_color" }, { status: 400 });
    patch.feature_bg = bg;
  }
  /** 메뉴를 다른 상단 탭으로 옮기기 — 대상은 상단 탭(1단)만 */
  if ("parent_id" in raw) {
    const target = cleanText(raw.parent_id, 64);
    if (!target || target === id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
    const t = await sb.from("delivery_menus").select("id, parent_id").eq("id", target).maybeSingle();
    if (t.error) return dbErrorResponse("PATCH parent", t.error);
    const row = t.data as { id: string; parent_id: string | null } | null;
    if (!row || row.parent_id != null) return NextResponse.json({ ok: false, error: "bad_parent" }, { status: 400 });
    patch.parent_id = target;
  }
  if ("start_at" in raw) patch.start_at = cleanIso(raw.start_at);
  if ("end_at" in raw) patch.end_at = cleanIso(raw.end_at);
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const { error } = await sb.from("delivery_menus").update(patch).eq("id", id);
  if (error) return dbErrorResponse("PATCH", error);
  bumpStorePublicSharedCacheGeneration("delivery_menus.update");
  await appendAdminRouteAudit(gate.sb, req, {
    actorId: gate.actor.userId,
    targetType: "delivery_menus",
    targetId: id,
    action: "delivery_menus.update",
    after: patch,
  });
  return NextResponse.json({ ok: true });
}

/**
 * DELETE ?id=&move_to= — 메뉴(또는 상단 탭) 삭제.
 * `move_to` 가 있으면 그 메뉴로 매장·업종 기본 메뉴를 먼저 옮긴 뒤 삭제 (S5). 없으면 매장이 남은 메뉴는 거부.
 */
export async function DELETE(req: Request) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const url = new URL(req.url);
  const id = cleanText(url.searchParams.get("id"), 64);
  const moveTo = cleanText(url.searchParams.get("move_to"), 64);
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const children = await sb.from("delivery_menus").select("id").eq("parent_id", id);
  if (children.error) return dbErrorResponse("DELETE children", children.error);
  const menuIds = [id, ...((children.data ?? []) as { id: string }[]).map((c) => String(c.id))];
  if (moveTo && menuIds.includes(moveTo)) {
    return NextResponse.json({ ok: false, error: "bad_move_target" }, { status: 400 });
  }

  if (moveTo) {
    const current = await sb
      .from("delivery_menu_store_overrides")
      .select("store_id")
      .in("menu_id", menuIds)
      .eq("mode", "include");
    if (current.error) return dbErrorResponse("DELETE move read", current.error);
    const ids = [...new Set(((current.data ?? []) as { store_id: string }[]).map((r) => String(r.store_id)))];
    if (ids.length) {
      const up = await sb.from("delivery_menu_store_overrides").upsert(
        ids.map((sid, i) => ({ menu_id: moveTo, store_id: sid, mode: "include", sort_order: 500 + i })),
        { onConflict: "menu_id,store_id", ignoreDuplicates: true }
      );
      if (up.error) return dbErrorResponse("DELETE move upsert", up.error);
    }
    const defs = await sb.from("delivery_menu_defaults").update({ menu_id: moveTo }).in("menu_id", menuIds);
    if (defs.error) return dbErrorResponse("DELETE move defaults", defs.error);
  }

  const { error } = await sb.from("delivery_menus").delete().eq("id", id);
  if (error) return dbErrorResponse("DELETE", error);
  bumpStorePublicSharedCacheGeneration("delivery_menus.delete");
  await appendAdminRouteAudit(gate.sb, req, {
    actorId: gate.actor.userId,
    targetType: "delivery_menus",
    targetId: id,
    action: "delivery_menus.delete",
    after: { move_to: moveTo, menu_count: menuIds.length },
  });
  return NextResponse.json({ ok: true });
}
