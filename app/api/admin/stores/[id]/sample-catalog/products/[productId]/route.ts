import { NextRequest, NextResponse } from "next/server";
import {
  appendAdminSampleCatalogAudit,
  requireAdminSampleCatalogStore,
} from "@/lib/admin-business/admin-sample-catalog-gate.server";
import {
  loadProductForOwner,
  patchStoreProductCore,
} from "@/lib/stores/owner-catalog/products-core.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; productId: string }> };

export async function GET(_req: NextRequest, context: Ctx) {
  const { id, productId } = await context.params;
  const pid = typeof productId === "string" ? productId.trim() : "";
  if (!pid) return NextResponse.json({ ok: false, error: "missing_param" }, { status: 400 });
  const g = await requireAdminSampleCatalogStore(id);
  if (!g.ok) return g.response;
  const res = await loadProductForOwner(g.sb, g.actor.userId, g.store.id, pid, g.store);
  if (!("product" in res) || !res.product) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, product: res.product });
}

export async function PATCH(req: NextRequest, context: Ctx) {
  const { id, productId } = await context.params;
  const pid = typeof productId === "string" ? productId.trim() : "";
  if (!pid) return NextResponse.json({ ok: false, error: "missing_param" }, { status: 400 });
  const g = await requireAdminSampleCatalogStore(id);
  if (!g.ok) return g.response;
  const res = await patchStoreProductCore(g.sb, g.store.id, pid, g.actor, g.store, req);
  if (res.ok) {
    await appendAdminSampleCatalogAudit({
      sb: g.sb,
      actor: g.actor,
      storeId: g.store.id,
      action: "product_update",
      req,
      after: { product_id: pid },
    });
  }
  return res;
}
