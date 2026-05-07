import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { parseNoticeImages } from "@/lib/stores/store-banners-notices-public";
import { revalidateStoreConsumerPathsBySlug } from "@/lib/stores/revalidate-store-consumer-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLACEMENTS = new Set(["store_top", "menu_top", "review_top", "info_tab"]);

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
    .from("store_notices")
    .select(
      "id, title, body, images_json, placement, start_at, end_at, is_active, sort_order, created_at, updated_at"
    )
    .eq("store_id", sid)
    .order("placement", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    if (/does not exist|schema cache/i.test(String(error.message))) {
      return NextResponse.json({ ok: true, notices: [], meta: { migration_pending: true } });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const { data: st } = await sb.from("stores").select("slug").eq("id", sid).maybeSingle();
  const slug = st && typeof (st as { slug?: string }).slug === "string" ? (st as { slug: string }).slug : null;

  return NextResponse.json({ ok: true, notices: data ?? [], meta: { slug } });
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

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  const bodyText = typeof body.body === "string" ? body.body.trim().slice(0, 8000) : "";
  const placement = typeof body.placement === "string" && PLACEMENTS.has(body.placement) ? body.placement : "";
  if (!placement) return NextResponse.json({ ok: false, error: "invalid_placement" }, { status: 400 });

  const images_json = parseNoticeImages(body.images_json);

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const sortRaw = Number(body.sort_order);
  const sort_order = Number.isFinite(sortRaw) ? Math.max(0, Math.min(9999, Math.floor(sortRaw))) : 0;
  const is_active = body.is_active !== false;
  const start_at = typeof body.start_at === "string" && body.start_at.trim() ? body.start_at.trim() : null;
  const end_at = typeof body.end_at === "string" && body.end_at.trim() ? body.end_at.trim() : null;

  const { data: created, error: insErr } = await sb
    .from("store_notices")
    .insert({
      store_id: sid,
      title,
      body: bodyText,
      images_json,
      placement,
      sort_order,
      is_active,
      start_at,
      end_at,
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    console.error("[POST store_notices]", insErr);
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  const slug = await resolveSlug(sb, sid);
  if (slug) revalidateStoreConsumerPathsBySlug(slug);

  return NextResponse.json({ ok: true, id: created?.id });
}
