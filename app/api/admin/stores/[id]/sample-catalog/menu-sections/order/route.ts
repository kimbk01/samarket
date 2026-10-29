import { NextRequest, NextResponse } from "next/server";
import {
  appendAdminSampleCatalogAudit,
  requireAdminSampleCatalogStore,
} from "@/lib/admin-business/admin-sample-catalog-gate.server";
import { parseMenuSectionOrderIds } from "@/lib/stores/menu-section-order";
import { reorderMenuSectionsCore } from "@/lib/stores/owner-catalog/menu-sections-core.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let body: { section_ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const ids = parseMenuSectionOrderIds(body.section_ids);
  if (!ids.ok) return NextResponse.json({ ok: false, error: ids.error }, { status: 400 });
  const g = await requireAdminSampleCatalogStore(id);
  if (!g.ok) return g.response;
  const res = await reorderMenuSectionsCore(g.sb, g.store.id, ids.value);
  if (res.ok) {
    await appendAdminSampleCatalogAudit({
      sb: g.sb,
      actor: g.actor,
      storeId: g.store.id,
      action: "menu_section_reorder",
      req,
      after: { section_ids: ids.value },
    });
  }
  return res;
}
