import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  name?: string;
  sort_order?: number;
  description?: string | null;
  is_hidden?: boolean;
};

/** 매장 오너: 카테고리(메뉴 구역) 이름·정렬 수정 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ storeId: string; sectionId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId, sectionId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const secId = typeof sectionId === "string" ? sectionId.trim() : "";
  if (!sid || !secId) {
    return NextResponse.json({ ok: false, error: "missing_param" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }
  if (gate.store.approval_status !== "approved") {
    return NextResponse.json({ ok: false, error: "store_not_approved" }, { status: 400 });
  }

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
    console.error("[PATCH menu-section]", upErr);
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, section: updated });
}

/** 매장 오너: 카테고리 삭제 (해당 상품의 menu_section_id 는 NULL 로) */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ storeId: string; sectionId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId, sectionId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const secId = typeof sectionId === "string" ? sectionId.trim() : "";
  if (!sid || !secId) {
    return NextResponse.json({ ok: false, error: "missing_param" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }
  if (gate.store.approval_status !== "approved") {
    return NextResponse.json({ ok: false, error: "store_not_approved" }, { status: 400 });
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
    console.error("[DELETE menu-section]", delErr);
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
