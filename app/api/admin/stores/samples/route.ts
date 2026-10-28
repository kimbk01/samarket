import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  afterAdminSampleWrite,
  createAdminSampleStore,
  type CreateAdminSampleStoreBody,
} from "@/lib/stores/sample/admin-sample-store.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — 샘플(체험용) 매장 목록 (업종·노출·메뉴 수) */
export async function GET() {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { data, error } = await sb
    .from("stores")
    .select(
      "id, slug, store_name, description, store_category_id, store_topic_id, business_type, profile_image_url, cover_image_url, is_visible, approval_status, created_at, store_categories ( name, slug ), store_topics ( name, slug )"
    )
    .eq("store_kind", "sample")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[admin samples GET]", error);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
  const ids = (data ?? []).map((r) => String((r as { id: string }).id));
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: prods } = await sb
      .from("store_products")
      .select("store_id")
      .in("store_id", ids)
      .neq("product_status", "deleted");
    for (const p of prods ?? []) {
      const sid = String((p as { store_id: string }).store_id);
      counts.set(sid, (counts.get(sid) ?? 0) + 1);
    }
  }
  return NextResponse.json(
    {
      ok: true,
      stores: (data ?? []).map((r) => ({ ...(r as object), product_count: counts.get(String((r as { id: string }).id)) ?? 0 })),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/** POST — 샘플 매장 생성 (숨김 상태로 생성) */
export async function POST(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let body: CreateAdminSampleStoreBody;
  try {
    body = (await req.json()) as CreateAdminSampleStoreBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const res = await createAdminSampleStore(sb, body);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });

  await afterAdminSampleWrite(sb, req, {
    actorId: gate.actor.userId,
    storeId: res.store.id,
    slug: res.store.slug,
    action: "create",
    after: { store_name: res.store.store_name, store_category_id: body.storeCategoryId ?? null },
  });
  return NextResponse.json({ ok: true, store: res.store });
}
