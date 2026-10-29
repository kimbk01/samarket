import { NextRequest, NextResponse } from "next/server";
import {
  appendAdminSampleCatalogAudit,
  requireAdminSampleCatalogStore,
} from "@/lib/admin-business/admin-sample-catalog-gate.server";
import { ownerCatalogDbErrorResponse } from "@/lib/stores/owner-catalog-write-guard";
import {
  loadOwnerProductsListSnapshot,
  parseOwnerProductsListLimit,
} from "@/lib/stores/owner-products-list-snapshot";
import { createStoreProductCore } from "@/lib/stores/owner-catalog/products-core.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** 오너 상품 목록과 같은 스냅샷 함수 (`loadOwnerProductsListSnapshot`). */
export async function GET(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const g = await requireAdminSampleCatalogStore(id);
  if (!g.ok) return g.response;
  const menuSectionId = req.nextUrl.searchParams.get("menu_section_id")?.trim() ?? "";
  const sectionFilter = menuSectionId.length >= 8 ? menuSectionId : "";
  const limit = parseOwnerProductsListLimit(req.nextUrl.searchParams.get("limit"));
  const loaded = await loadOwnerProductsListSnapshot(g.sb, g.store.id, {
    sectionFilter,
    limit,
    skipCache: true,
  });
  if (!loaded.ok) return ownerCatalogDbErrorResponse("[admin sample GET products]", loaded.error);
  return NextResponse.json({ ok: true, products: loaded.snapshot.products });
}

export async function POST(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const g = await requireAdminSampleCatalogStore(id);
  if (!g.ok) return g.response;
  const res = await createStoreProductCore(g.sb, g.store.id, g.actor, req);
  if (res.ok) {
    const json = (await res.clone().json().catch(() => null)) as { product?: { id?: string } } | null;
    await appendAdminSampleCatalogAudit({
      sb: g.sb,
      actor: g.actor,
      storeId: g.store.id,
      action: "product_create",
      req,
      after: { product_id: json?.product?.id ?? null },
    });
  }
  return res;
}
