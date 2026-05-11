import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { revalidateStoreConsumerPathsBySlug } from "@/lib/stores/revalidate-store-consumer-paths";
import { coerceStoreBannerLink } from "@/lib/stores/store-banner-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveSlug(sb: ReturnType<typeof tryGetSupabaseForStores>, storeId: string): Promise<string | null> {
  if (!sb) return null;
  const { data } = await sb.from("stores").select("slug").eq("id", storeId).maybeSingle();
  const s = data && typeof (data as { slug?: string }).slug === "string" ? (data as { slug: string }).slug.trim() : "";
  return s || null;
}

export async function GET(_req: Request, context: { params: Promise<{ storeId: string }> }) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const { data, error } = await sb
    .from("store_banners")
    .select(
      "id, image_url, title, description, link_type, link_target_id, start_at, end_at, is_active, sort_order, created_at, updated_at"
    )
    .eq("store_id", sid)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    if (/does not exist|schema cache/i.test(String(error.message))) {
      return NextResponse.json({ ok: true, banners: [], meta: { migration_pending: true } });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const { data: st } = await sb.from("stores").select("slug").eq("id", sid).maybeSingle();
  const slug = st && typeof (st as { slug?: string }).slug === "string" ? (st as { slug: string }).slug : null;

  return NextResponse.json({ ok: true, banners: data ?? [], meta: { slug } });
}

export async function POST(req: NextRequest, context: { params: Promise<{ storeId: string }> }) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const image_url = typeof body.image_url === "string" ? body.image_url.trim() : "";
  if (!image_url) return NextResponse.json({ ok: false, error: "image_url_required" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const ltRaw = typeof body.link_type === "string" ? body.link_type : "none";
  const coerced = coerceStoreBannerLink(ltRaw, body.link_target_id);
  if (!coerced.ok) {
    return NextResponse.json({ ok: false, error: coerced.error }, { status: 400 });
  }
  const { link_type, link_target_id } = coerced;

  if (link_type === "product" && link_target_id) {
    const { data: pr } = await sb
      .from("store_products")
      .select("id")
      .eq("id", link_target_id)
      .eq("store_id", sid)
      .maybeSingle();
    if (!pr) return NextResponse.json({ ok: false, error: "invalid_link_target" }, { status: 400 });
  }
  if (link_type === "notice" && link_target_id) {
    const { data: no } = await sb
      .from("store_notices")
      .select("id")
      .eq("id", link_target_id)
      .eq("store_id", sid)
      .maybeSingle();
    if (!no) return NextResponse.json({ ok: false, error: "invalid_link_target" }, { status: 400 });
  }

  const sortRaw = Number(body.sort_order);
  const sort_order = Number.isFinite(sortRaw) ? Math.max(0, Math.min(9999, Math.floor(sortRaw))) : 0;
  const is_active = body.is_active !== false;
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : null;
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 500) : null;
  const start_at = typeof body.start_at === "string" && body.start_at.trim() ? body.start_at.trim() : null;
  const end_at = typeof body.end_at === "string" && body.end_at.trim() ? body.end_at.trim() : null;

  const { data: created, error: insErr } = await sb
    .from("store_banners")
    .insert({
      store_id: sid,
      image_url,
      title: title || null,
      description: description || null,
      link_type,
      link_target_id,
      sort_order,
      is_active,
      start_at,
      end_at,
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    console.error("[POST store_banners]", insErr);
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  const slug = await resolveSlug(sb, sid);
  if (slug) revalidateStoreConsumerPathsBySlug(slug);

  return NextResponse.json({ ok: true, id: created?.id });
}
