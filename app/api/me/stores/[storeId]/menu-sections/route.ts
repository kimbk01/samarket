import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 매장 오너: 메뉴 카테고리(store_menu_sections) 목록 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: true, sections: [], meta: { source: "supabase_unconfigured" } });
  }

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

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
    console.error("[GET menu-sections]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sections: data ?? [], meta: { source: "supabase" } });
}

type PostBody = {
  name?: string;
  sort_order?: number;
  description?: string | null;
  is_hidden?: boolean;
};

/** 매장 오너: 메뉴 카테고리 추가 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  let body: PostBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (name.length < 1 || name.length > 80) {
    return NextResponse.json({ ok: false, error: "invalid_name" }, { status: 400 });
  }

  const sortRaw = Number(body.sort_order ?? 0);
  const sort_order = Number.isFinite(sortRaw) ? Math.max(0, Math.min(9999, Math.floor(sortRaw))) : 0;

  let description: string | null = null;
  if (body.description !== undefined && body.description !== null) {
    const d = String(body.description).trim();
    description = d.length > 0 ? d.slice(0, 2000) : null;
  }
  const is_hidden = body.is_hidden === true;

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

  const { data: created, error: insErr } = await sb
    .from("store_menu_sections")
    .insert({ store_id: sid, name, sort_order, description, is_hidden })
    .select("id, name, sort_order, description, is_hidden")
    .maybeSingle();

  if (insErr) {
    if (/duplicate key|unique/i.test(String(insErr.message))) {
      return NextResponse.json({ ok: false, error: "duplicate_section_name" }, { status: 409 });
    }
    if (/column|does not exist|schema cache/i.test(String(insErr.message))) {
      return NextResponse.json({ ok: false, error: "migration_pending" }, { status: 503 });
    }
    console.error("[POST menu-sections]", insErr);
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, section: created });
}
