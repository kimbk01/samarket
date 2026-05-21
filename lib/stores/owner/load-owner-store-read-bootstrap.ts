/**
 * 매장 오너 읽기 전용 데이터 — RSC에서 한 번에 로드해 클라 첫 `fetch` 전에 화면을 채운다.
 * API 라우트(`GET .../menu-sections`, `GET .../products`)와 동일한 권한·쿼리를 유지한다.
 */
import { cache } from "react";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadOwnerProductsListSnapshot } from "@/lib/stores/owner-products-list-snapshot";

const ownerStoreReadCtx = cache(
  async (
    storeId: string
  ): Promise<
    | { ok: true; sid: string; sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>> }
    | { ok: false; error: string }
  > => {
    const sid = typeof storeId === "string" ? storeId.trim() : "";
    if (!sid) return { ok: false, error: "missing_store_id" };

    const userId = await getRouteUserId();
    if (!userId) return { ok: false, error: "unauthorized" };

    const session = await validateActiveSession(userId);
    if (!session.ok) return { ok: false, error: "session_invalid" };

    const sb = tryGetSupabaseForStores();
    if (!sb) return { ok: false, error: "supabase_unconfigured" };

    const { data: store, error: sErr } = await sb
      .from("stores")
      .select("id, owner_user_id")
      .eq("id", sid)
      .maybeSingle();

    if (sErr || !store || store.owner_user_id !== userId) {
      return { ok: false, error: "forbidden" };
    }

    return { ok: true, sid, sb };
  }
);

export type OwnerRscMenuSection = {
  id: string;
  name: string;
  sort_order: number;
  description: string | null;
  is_hidden: boolean;
};

export type OwnerRscHubProduct = {
  id: string;
  title: string;
  summary?: string | null;
  price: number;
  discount_price?: number | null;
  thumbnail_url?: string | null;
  product_status: string;
  menu_section_id?: string | null;
  store_menu_sections?: OwnerRscMenuSection | OwnerRscMenuSection[] | null;
};

/** 카테고리(메뉴 구역) 목록 — RSC·클라 공용 shape */
export const loadOwnerMenuSectionsForRsc = cache(
  async (
    storeId: string
  ): Promise<
    | { ok: true; sections: OwnerRscMenuSection[]; meta?: { source?: string } }
    | { ok: false; error: string }
  > => {
    const ctx = await ownerStoreReadCtx(storeId);
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const { data, error } = await ctx.sb
      .from("store_menu_sections")
      .select("id, name, sort_order, description, is_hidden")
      .eq("store_id", ctx.sid)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      if (/column|does not exist|schema cache/i.test(String(error.message))) {
        return { ok: true, sections: [], meta: { source: "migration_pending" } };
      }
      return { ok: false, error: error.message };
    }

    const sections: OwnerRscMenuSection[] = (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      sort_order: Number(row.sort_order) || 0,
      description: row.description != null ? String(row.description) : null,
      is_hidden: row.is_hidden === true,
    }));

    return { ok: true, sections };
  }
);

/** 상품 목록(삭제 제외) — 상품 허브 RSC */
export const loadOwnerProductsListForRsc = cache(
  async (
    storeId: string
  ): Promise<{ ok: true; products: OwnerRscHubProduct[] } | { ok: false; error: string }> => {
    const ctx = await ownerStoreReadCtx(storeId);
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const loaded = await loadOwnerProductsListSnapshot(ctx.sb as import("@supabase/supabase-js").SupabaseClient<any>, ctx.sid);
    if (!loaded.ok) {
      return { ok: false, error: loaded.error };
    }

    return {
      ok: true,
      products: loaded.snapshot.products as unknown as OwnerRscHubProduct[],
    };
  }
);

/** 상품 허브: 구역 + 상품 병렬 — 동일 RSC 요청에서 `ownerStoreReadCtx` 단일 비행 */
export const loadOwnerProductsHubBootstrap = cache(
  async (
    storeId: string
  ): Promise<
    | {
        ok: true;
        sections: OwnerRscMenuSection[];
        products: OwnerRscHubProduct[];
        menuMeta?: { source?: string };
      }
    | { ok: false; error: string }
  > => {
    const [sec, prod] = await Promise.all([
      loadOwnerMenuSectionsForRsc(storeId),
      loadOwnerProductsListForRsc(storeId),
    ]);

    if (!sec.ok) return { ok: false, error: sec.error };
    if (!prod.ok) return { ok: false, error: prod.error };

    return {
      ok: true,
      sections: sec.sections,
      products: prod.products,
      menuMeta: sec.meta,
    };
  }
);
