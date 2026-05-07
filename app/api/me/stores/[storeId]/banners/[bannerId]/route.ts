import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { revalidateStoreConsumerPathsBySlug } from "@/lib/stores/revalidate-store-consumer-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LINK_TYPES = new Set(["none", "product", "notice", "coupon"]);

async function resolveSlug(sb: ReturnType<typeof tryGetSupabaseForStores>, storeId: string): Promise<string | null> {
  if (!sb) return null;
  const { data } = await sb.from("stores").select("slug").eq("id", storeId).maybeSingle();
  const s = data && typeof (data as { slug?: string }).slug === "string" ? (data as { slug: string }).slug.trim() : "";
  return s || null;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ storeId: string; bannerId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId, bannerId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const bid = typeof bannerId === "string" ? bannerId.trim() : "";
  if (!sid || !bid) return NextResponse.json({ ok: false, error: "missing_param" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const { data: existing, error: findErr } = await sb
    .from("store_banners")
    .select("id")
    .eq("id", bid)
    .eq("store_id", sid)
    .maybeSingle();
  if (findErr || !existing) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};
  if (body.image_url !== undefined) {
    const u = typeof body.image_url === "string" ? body.image_url.trim() : "";
    if (!u) return NextResponse.json({ ok: false, error: "image_url_empty" }, { status: 400 });
    patch.image_url = u;
  }
  if (body.title !== undefined) {
    patch.title = typeof body.title === "string" ? body.title.trim().slice(0, 200) || null : null;
  }
  if (body.description !== undefined) {
    patch.description = typeof body.description === "string" ? body.description.trim().slice(0, 500) || null : null;
  }
  if (body.link_type !== undefined) {
    const lt = String(body.link_type).trim();
    if (!LINK_TYPES.has(lt)) return NextResponse.json({ ok: false, error: "invalid_link_type" }, { status: 400 });
    patch.link_type = lt;
  }
  if (body.link_target_id !== undefined) {
    patch.link_target_id =
      body.link_target_id == null || body.link_target_id === "" ? null : String(body.link_target_id).trim();
  }
  if (body.sort_order !== undefined) {
    const n = Number(body.sort_order);
    patch.sort_order = Number.isFinite(n) ? Math.max(0, Math.min(9999, Math.floor(n))) : 0;
  }
  if (body.is_active !== undefined) {
    patch.is_active = !!body.is_active;
  }
  if (body.start_at !== undefined) {
    patch.start_at = typeof body.start_at === "string" && body.start_at.trim() ? body.start_at.trim() : null;
  }
  if (body.end_at !== undefined) {
    patch.end_at = typeof body.end_at === "string" && body.end_at.trim() ? body.end_at.trim() : null;
  }

  const nextLt = (patch.link_type as string | undefined) ?? undefined;
  const targetId = (patch.link_target_id as string | null | undefined) ?? undefined;
  if (nextLt === "product" && targetId) {
    const { data: pr } = await sb.from("store_products").select("id").eq("id", targetId).eq("store_id", sid).maybeSingle();
    if (!pr) return NextResponse.json({ ok: false, error: "invalid_link_target" }, { status: 400 });
  }
  if (nextLt === "notice" && targetId) {
    const { data: no } = await sb.from("store_notices").select("id").eq("id", targetId).eq("store_id", sid).maybeSingle();
    if (!no) return NextResponse.json({ ok: false, error: "invalid_link_target" }, { status: 400 });
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "empty_patch" }, { status: 400 });
  }

  const { error: upErr } = await sb.from("store_banners").update(patch).eq("id", bid).eq("store_id", sid);
  if (upErr) {
    console.error("[PATCH store_banners]", upErr);
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  const slug = await resolveSlug(sb, sid);
  if (slug) revalidateStoreConsumerPathsBySlug(slug);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ storeId: string; bannerId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId, bannerId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const bid = typeof bannerId === "string" ? bannerId.trim() : "";
  if (!sid || !bid) return NextResponse.json({ ok: false, error: "missing_param" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const { error: delErr } = await sb.from("store_banners").delete().eq("id", bid).eq("store_id", sid);
  if (delErr) {
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
  }

  const slug = await resolveSlug(sb, sid);
  if (slug) revalidateStoreConsumerPathsBySlug(slug);

  return NextResponse.json({ ok: true });
}
