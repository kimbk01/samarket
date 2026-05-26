import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { DELIVERY_BOTTOM_NAV_SERVER_CACHE_TAG } from "@/lib/delivery/load-delivery-bottom-nav-items-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Patch = Partial<{
  label: string;
  icon_key: string;
  href: string;
  sort_order: number;
  is_active: boolean;
  is_center: boolean;
  requires_store_id: boolean;
  color: string;
}>;

async function requireAdmin() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { data, error } = await sb
    .from("delivery_bottom_nav_items")
    .select("id,label,icon_key,href,sort_order,is_active,is_center,requires_store_id,color,created_at,updated_at")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    if (error.message?.includes("delivery_bottom_nav_items") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[GET admin stores bottom-nav]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const, items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const patch: Patch = {
    label: typeof b.label === "string" ? b.label : "",
    icon_key: typeof b.icon_key === "string" ? b.icon_key : "",
    href: typeof b.href === "string" ? b.href : "",
    sort_order: typeof b.sort_order === "number" ? b.sort_order : 0,
    is_active: typeof b.is_active === "boolean" ? b.is_active : true,
    is_center: typeof b.is_center === "boolean" ? b.is_center : false,
    /** 배달 하단의 「내매장」은 앱에서 소유 매장 유무로만 제어 — 어드민에서 분기하지 않음 */
    requires_store_id: false,
    color: typeof b.color === "string" && b.color ? b.color : "#0B421A",
  };

  if (!patch.label || !patch.icon_key || !patch.href) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  try {
    if (patch.is_center) {
      // Best-effort: clear existing center first. DB partial unique index is the final guard.
      await sb.from("delivery_bottom_nav_items").update({ is_center: false }).eq("is_center", true);
    }

    const { data, error } = await sb
      .from("delivery_bottom_nav_items")
      .insert(patch)
      .select("id,label,icon_key,href,sort_order,is_active,is_center,requires_store_id,color,created_at,updated_at")
      .single();

    if (error) {
      console.error("[POST admin stores bottom-nav]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    revalidateTag(DELIVERY_BOTTOM_NAV_SERVER_CACHE_TAG, "default");
    return NextResponse.json({ ok: true as const, item: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown_error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id : "";
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const patch: Patch = {};
  for (const k of ["label", "icon_key", "href", "sort_order", "is_active", "is_center", "color"] as const) {
    if (b[k] !== undefined) (patch as any)[k] = b[k] as any;
  }

  try {
    if (patch.is_center === true) {
      await sb.from("delivery_bottom_nav_items").update({ is_center: false }).eq("is_center", true).neq("id", id);
    }

    (patch as Patch).requires_store_id = false;

    const { data, error } = await sb
      .from("delivery_bottom_nav_items")
      .update(patch)
      .eq("id", id)
      .select("id,label,icon_key,href,sort_order,is_active,is_center,requires_store_id,color,created_at,updated_at")
      .maybeSingle();

    if (error) {
      console.error("[PUT admin stores bottom-nav]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    revalidateTag(DELIVERY_BOTTOM_NAV_SERVER_CACHE_TAG, "default");
    return NextResponse.json({ ok: true as const, item: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown_error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const { error } = await sb.from("delivery_bottom_nav_items").delete().eq("id", id);
  if (error) {
    console.error("[DELETE admin stores bottom-nav]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  revalidateTag(DELIVERY_BOTTOM_NAV_SERVER_CACHE_TAG, "default");
  return NextResponse.json({ ok: true as const });
}

