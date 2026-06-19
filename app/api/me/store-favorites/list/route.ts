import { NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import type { FavoritedStoreListItem } from "@/lib/stores/favorited-store-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = (await getOptionalAuthenticatedUserId()) ?? "";
  if (!userId) {
    return NextResponse.json({ items: [], authenticated: false });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ items: [], authenticated: true });
  }

  const { data: favs, error: favError } = await sb
    .from("store_favorites")
    .select("store_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (favError) {
    if (process.env.NODE_ENV === "development") {
      console.error("[me/store-favorites/list] favorites select:", favError.message);
    }
    return NextResponse.json({ items: [], authenticated: true });
  }

  if (!favs?.length) {
    return NextResponse.json({ items: [], authenticated: true });
  }

  const storeIds = favs.map((f: { store_id: string }) => f.store_id);
  const { data: stores, error: storeError } = await sb
    .from("stores")
    .select(
      "id, slug, store_name, profile_image_url, region, city, district, is_open, rating_avg, review_count, delivery_available, pickup_available, approval_status, is_visible"
    )
    .in("id", storeIds);

  if (storeError) {
    if (process.env.NODE_ENV === "development") {
      console.error("[me/store-favorites/list] stores select:", storeError.message);
    }
    return NextResponse.json({ items: [], authenticated: true });
  }

  const byId = new Map(
    (stores ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return [String(r.id ?? ""), r];
    })
  );

  const items: FavoritedStoreListItem[] = [];
  for (const f of favs as { store_id: string; created_at: string }[]) {
    const row = byId.get(f.store_id);
    if (!row) continue;
    const approval = String(row.approval_status ?? "");
    const visible = row.is_visible === true;
    items.push({
      id: String(row.id ?? f.store_id),
      slug: String(row.slug ?? ""),
      store_name: String(row.store_name ?? ""),
      profile_image_url:
        typeof row.profile_image_url === "string" ? row.profile_image_url : null,
      region: typeof row.region === "string" ? row.region : null,
      city: typeof row.city === "string" ? row.city : null,
      district: typeof row.district === "string" ? row.district : null,
      is_open: typeof row.is_open === "boolean" ? row.is_open : null,
      rating_avg: typeof row.rating_avg === "number" ? row.rating_avg : null,
      review_count: typeof row.review_count === "number" ? row.review_count : null,
      delivery_available: typeof row.delivery_available === "boolean" ? row.delivery_available : null,
      pickup_available: typeof row.pickup_available === "boolean" ? row.pickup_available : null,
      available: approval === "approved" && visible,
      favorited_at: f.created_at,
    });
  }

  return NextResponse.json({ items, authenticated: true });
}
