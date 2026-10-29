import { NextRequest, NextResponse } from "next/server";
import {
  appendAdminSampleCatalogAudit,
  requireAdminSampleCatalogStore,
} from "@/lib/admin-business/admin-sample-catalog-gate.server";
import {
  deleteMenuSectionCore,
  patchMenuSectionCore,
  readMenuSectionMoveTo,
  type PatchMenuSectionBody,
} from "@/lib/stores/owner-catalog/menu-sections-core.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; sectionId: string }> };

export async function PATCH(req: NextRequest, context: Ctx) {
  const { id, sectionId } = await context.params;
  const secId = typeof sectionId === "string" ? sectionId.trim() : "";
  if (!secId) return NextResponse.json({ ok: false, error: "missing_param" }, { status: 400 });
  let body: PatchMenuSectionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const g = await requireAdminSampleCatalogStore(id);
  if (!g.ok) return g.response;
  const res = await patchMenuSectionCore(g.sb, g.store.id, secId, body);
  if (res.ok) {
    await appendAdminSampleCatalogAudit({
      sb: g.sb,
      actor: g.actor,
      storeId: g.store.id,
      action: "menu_section_update",
      req,
      after: { section_id: secId, fields: Object.keys(body ?? {}) },
    });
  }
  return res;
}

export async function DELETE(req: NextRequest, context: Ctx) {
  const { id, sectionId } = await context.params;
  const secId = typeof sectionId === "string" ? sectionId.trim() : "";
  if (!secId) return NextResponse.json({ ok: false, error: "missing_param" }, { status: 400 });
  const g = await requireAdminSampleCatalogStore(id);
  if (!g.ok) return g.response;
  const moveTo = readMenuSectionMoveTo(req.url);
  const res = await deleteMenuSectionCore(g.sb, g.store.id, secId, moveTo);
  if (res.ok) {
    await appendAdminSampleCatalogAudit({
      sb: g.sb,
      actor: g.actor,
      storeId: g.store.id,
      action: "menu_section_delete",
      req,
      after: { section_id: secId, move_to: moveTo || null },
    });
  }
  return res;
}
