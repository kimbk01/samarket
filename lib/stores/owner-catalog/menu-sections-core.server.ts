/**
 * 3-C §9-3 — 메뉴 카테고리(store_menu_sections) 저장 코어. 오너 라우트 본문을 그대로 옮겼다.
 * 호출부(오너 `/api/me/stores/[storeId]/menu-sections/**` · 관리자 샘플 `/api/admin/stores/[id]/sample-catalog/menu-sections/**`)가
 * 권한·소유·샘플 여부를 먼저 확인한다. 저장·검증·캐시 무효화는 여기 한 곳.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ownerCatalogDbErrorResponse } from "@/lib/stores/owner-catalog-write-guard";
import { invalidateStoreMenusSnapshotCacheByStoreId } from "@/lib/stores/store-menus-snapshot-invalidate-by-store-id";
import { invalidateOwnerProductsListCache } from "@/lib/stores/owner-products-list-snapshot";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";

type AnySb = SupabaseClient<any>;

export async function listMenuSectionsCore(sb: AnySb, sid: string): Promise<NextResponse> {
  const { data, error } = await sb
    .from("store_menu_sections")
    .select("id, name, sort_order, description, is_hidden")
    .eq("store_id", sid)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    if (/column|does not exist|schema cache/i.test(String(error.message))) {
      return NextResponse.json({
        ok: true,
        sections: [],
        meta: { source: "migration_pending", hint: "store_menu_sections" },
      });
    }
    return ownerCatalogDbErrorResponse("[GET menu-sections]", error);
  }

  return NextResponse.json({ ok: true, sections: data ?? [], meta: { source: "supabase" } });
}

export type CreateMenuSectionBody = {
  name?: string;
  sort_order?: number;
  description?: string | null;
  is_hidden?: boolean;
};

export type CreateMenuSectionValue = {
  name: string;
  sort_order: number;
  description: string | null;
  is_hidden: boolean;
};

export function parseCreateMenuSectionBody(
  body: CreateMenuSectionBody
): { ok: true; value: CreateMenuSectionValue } | { ok: false; response: NextResponse } {
  const name = String(body.name ?? "").trim();
  if (name.length < 1 || name.length > 80) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "invalid_name" }, { status: 400 }) };
  }

  const sortRaw = Number(body.sort_order ?? 0);
  const sort_order = Number.isFinite(sortRaw) ? Math.max(0, Math.min(9999, Math.floor(sortRaw))) : 0;

  let description: string | null = null;
  if (body.description !== undefined && body.description !== null) {
    const d = String(body.description).trim();
    description = d.length > 0 ? d.slice(0, 2000) : null;
  }
  const is_hidden = body.is_hidden === true;
  return { ok: true, value: { name, sort_order, description, is_hidden } };
}

export async function createMenuSectionCore(
  sb: AnySb,
  sid: string,
  value: CreateMenuSectionValue
): Promise<NextResponse> {
  const { data: created, error: insErr } = await sb
    .from("store_menu_sections")
    .insert({ store_id: sid, ...value })
    .select("id, name, sort_order, description, is_hidden")
    .maybeSingle();

  if (insErr) {
    if (/duplicate key|unique/i.test(String(insErr.message))) {
      return NextResponse.json({ ok: false, error: "duplicate_section_name" }, { status: 409 });
    }
    if (/column|does not exist|schema cache/i.test(String(insErr.message))) {
      return NextResponse.json({ ok: false, error: "migration_pending" }, { status: 503 });
    }
    return ownerCatalogDbErrorResponse("[POST menu-sections]", insErr);
  }

  invalidateStoreMenusSnapshotCacheByStoreId(sid);
  bumpStorePublicSharedCacheGeneration("owner_store.menu_section_create"); // OPS-02
  return NextResponse.json({ ok: true, section: created });
}

export type PatchMenuSectionBody = {
  name?: string;
  sort_order?: number;
  description?: string | null;
  is_hidden?: boolean;
};

export async function patchMenuSectionCore(
  sb: AnySb,
  sid: string,
  secId: string,
  body: PatchMenuSectionBody
): Promise<NextResponse> {
  const { data: existing, error: findErr } = await sb
    .from("store_menu_sections")
    .select("id")
    .eq("id", secId)
    .eq("store_id", sid)
    .maybeSingle();

  if (findErr && /column|does not exist|schema cache/i.test(String(findErr.message))) {
    return NextResponse.json({ ok: false, error: "migration_pending" }, { status: 503 });
  }
  if (!existing) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 1 || name.length > 80) {
      return NextResponse.json({ ok: false, error: "invalid_name" }, { status: 400 });
    }
    patch.name = name;
  }
  if (body.sort_order !== undefined) {
    const sortRaw = Number(body.sort_order);
    const sort_order = Number.isFinite(sortRaw)
      ? Math.max(0, Math.min(9999, Math.floor(sortRaw)))
      : 0;
    patch.sort_order = sort_order;
  }
  if (body.description !== undefined) {
    if (body.description === null) {
      patch.description = null;
    } else {
      const d = String(body.description).trim();
      patch.description = d.length > 0 ? d.slice(0, 2000) : null;
    }
  }
  if (body.is_hidden !== undefined) {
    patch.is_hidden = !!body.is_hidden;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "empty_patch" }, { status: 400 });
  }

  const { data: updated, error: upErr } = await sb
    .from("store_menu_sections")
    .update(patch)
    .eq("id", secId)
    .eq("store_id", sid)
    .select("id, name, sort_order, description, is_hidden")
    .maybeSingle();

  if (upErr) {
    if (/duplicate key|unique/i.test(String(upErr.message))) {
      return NextResponse.json({ ok: false, error: "duplicate_section_name" }, { status: 409 });
    }
    return ownerCatalogDbErrorResponse("[PATCH menu-section]", upErr);
  }

  invalidateStoreMenusSnapshotCacheByStoreId(sid);
  invalidateOwnerProductsListCache(sid); // PRD-09 — 구역 숨김/이름이 오너 허브에 즉시 반영
  bumpStorePublicSharedCacheGeneration("owner_store.menu_section_update"); // OPS-02
  return NextResponse.json({ ok: true, section: updated });
}

/**
 * PRD-13 — 소속 상품(삭제 제외)이 있으면 409 `section_has_products`(+count). `moveTo` 가 있으면 같은 요청에서
 * 상품을 옮긴 뒤 삭제한다. 빈 카테고리는 바로 삭제.
 */
export async function deleteMenuSectionCore(
  sb: AnySb,
  sid: string,
  secId: string,
  moveTo: string
): Promise<NextResponse> {
  const { data: existing, error: findErr } = await sb
    .from("store_menu_sections")
    .select("id")
    .eq("id", secId)
    .eq("store_id", sid)
    .maybeSingle();
  if (findErr) {
    if (/column|does not exist|schema cache/i.test(String(findErr.message))) {
      return NextResponse.json({ ok: false, error: "migration_pending" }, { status: 503 });
    }
    return ownerCatalogDbErrorResponse("[DELETE menu-section] find", findErr);
  }
  if (!existing) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const { count: productCount, error: countErr } = await sb
    .from("store_products")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .eq("menu_section_id", secId)
    .not("product_status", "eq", "deleted");
  if (countErr) return ownerCatalogDbErrorResponse("[DELETE menu-section] count", countErr);
  const count = typeof productCount === "number" ? productCount : 0;

  if (count > 0) {
    if (!moveTo) {
      return NextResponse.json({ ok: false, error: "section_has_products", count }, { status: 409 });
    }
    if (moveTo === secId) {
      return NextResponse.json({ ok: false, error: "invalid_move_target" }, { status: 400 });
    }
    const { data: target, error: targetErr } = await sb
      .from("store_menu_sections")
      .select("id")
      .eq("id", moveTo)
      .eq("store_id", sid)
      .maybeSingle();
    if (targetErr) return ownerCatalogDbErrorResponse("[DELETE menu-section] target", targetErr);
    if (!target) {
      return NextResponse.json({ ok: false, error: "invalid_move_target" }, { status: 400 });
    }
    // 삭제(soft) 상품 포함 전부 이동 — FK SET NULL 로 남는 행이 없게
    const { error: moveErr } = await sb
      .from("store_products")
      .update({ menu_section_id: moveTo })
      .eq("store_id", sid)
      .eq("menu_section_id", secId);
    if (moveErr) return ownerCatalogDbErrorResponse("[DELETE menu-section] move", moveErr);
  }

  const { error: delErr } = await sb
    .from("store_menu_sections")
    .delete()
    .eq("id", secId)
    .eq("store_id", sid);

  if (delErr) {
    if (/column|does not exist|schema cache/i.test(String(delErr.message))) {
      return NextResponse.json({ ok: false, error: "migration_pending" }, { status: 503 });
    }
    // 이동은 반영됐을 수 있다 — 캐시는 맞춘다
    if (count > 0) {
      invalidateStoreMenusSnapshotCacheByStoreId(sid);
      invalidateOwnerProductsListCache(sid);
      bumpStorePublicSharedCacheGeneration("owner_store.menu_section_delete");
    }
    return ownerCatalogDbErrorResponse("[DELETE menu-section]", delErr);
  }

  invalidateStoreMenusSnapshotCacheByStoreId(sid);
  invalidateOwnerProductsListCache(sid); // PRD-09 — 삭제 구역 상품(menu_section_id NULL) 즉시 반영
  bumpStorePublicSharedCacheGeneration("owner_store.menu_section_delete"); // OPS-02
  return NextResponse.json({ ok: true, ...(count > 0 ? { moved: count, moved_to: moveTo } : {}) });
}

/** PRD-11 — RPC `reorder_store_menu_sections` 한 트랜잭션 (호출부가 `parseMenuSectionOrderIds` 로 검증). */
export async function reorderMenuSectionsCore(
  sb: AnySb,
  sid: string,
  sectionIds: string[]
): Promise<NextResponse> {
  const { data, error } = await sb.rpc("reorder_store_menu_sections", {
    p_store_id: sid,
    p_section_ids: sectionIds,
  });

  if (error) {
    const msg = String(error.message ?? "");
    if (/section_not_in_store/.test(msg)) {
      return NextResponse.json({ ok: false, error: "invalid_section_ids" }, { status: 400 });
    }
    if (/could not find the function|reorder_store_menu_sections.*does not exist|PGRST202/i.test(msg) ||
        (error as { code?: string }).code === "PGRST202") {
      return NextResponse.json({ ok: false, error: "migration_pending" }, { status: 503 });
    }
    return ownerCatalogDbErrorResponse("[PUT menu-sections/order]", error);
  }

  invalidateStoreMenusSnapshotCacheByStoreId(sid);
  invalidateOwnerProductsListCache(sid);
  bumpStorePublicSharedCacheGeneration("owner_store.menu_section_reorder"); // OPS-02
  const updated =
    data && typeof data === "object" && "updated" in (data as Record<string, unknown>)
      ? Number((data as Record<string, unknown>).updated) || 0
      : 0;
  return NextResponse.json({ ok: true, updated });
}

export function readMenuSectionMoveTo(reqUrl: string): string {
  try {
    return new URL(reqUrl).searchParams.get("moveTo")?.trim() ?? "";
  } catch {
    return "";
  }
}
