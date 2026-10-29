import { NextRequest, NextResponse } from "next/server";
import {
  appendAdminSampleCatalogAudit,
  requireAdminSampleCatalogStore,
} from "@/lib/admin-business/admin-sample-catalog-gate.server";
import {
  createMenuSectionCore,
  listMenuSectionsCore,
  parseCreateMenuSectionBody,
  type CreateMenuSectionBody,
} from "@/lib/stores/owner-catalog/menu-sections-core.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const g = await requireAdminSampleCatalogStore(id);
  if (!g.ok) return g.response;
  return listMenuSectionsCore(g.sb, g.store.id);
}

export async function POST(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  let body: CreateMenuSectionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = parseCreateMenuSectionBody(body);
  if (!parsed.ok) return parsed.response;
  const g = await requireAdminSampleCatalogStore(id);
  if (!g.ok) return g.response;
  const res = await createMenuSectionCore(g.sb, g.store.id, parsed.value);
  if (res.ok) {
    await appendAdminSampleCatalogAudit({
      sb: g.sb,
      actor: g.actor,
      storeId: g.store.id,
      action: "menu_section_create",
      req,
      after: { name: parsed.value.name },
    });
  }
  return res;
}
