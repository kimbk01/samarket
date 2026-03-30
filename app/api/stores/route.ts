import { NextResponse } from "next/server";
import { districtRank, haversineKm } from "@/lib/geo/haversine-km";
import { resolveStoreFrontOpen } from "@/lib/stores/store-auto-hours";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

function parseCoord(v: string | null): number | null {
  if (v == null || !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** ilike 패턴용: 와일드카드·콤마·따옴표 제거 (최소 2자) */
function parseSearchQ(raw: string | null): string | null {
  if (raw == null) return null;
  const t = raw
    .trim()
    .slice(0, 60)
    .replace(/[%_,]/g, "")
    .replace(/"/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length >= 2 ? t : null;
}

type StoreRow = {
  id: string;
  store_name: string;
  slug: string;
  region: string | null;
  city: string | null;
  district: string | null;
  lat: number | null;
  lng: number | null;
  profile_image_url: string | null;
  description: string | null;
  is_open: boolean | null;
  business_hours_json: unknown;
  created_at: string;
};

/**
 * 공개 매장 목록 (승인·노출만)
 * ?region= & ?district= 필터 (ilike)
 * ?q= 매장명·슬러그 검색 (2자 이상)
 * ?user_lat= & ?user_lng= — 동네 필터와 함께 거리 가중 정렬
 */
export async function GET(req: Request) {
  const supabase = tryGetSupabaseForStores();
  if (!supabase) {
    return NextResponse.json({ ok: true, stores: [], meta: { source: "supabase_unconfigured" } });
  }

  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region")?.trim() || null;
  const district = searchParams.get("district")?.trim() || null;
  const searchQ = parseSearchQ(searchParams.get("q"));
  const userLat = parseCoord(searchParams.get("user_lat"));
  const userLng = parseCoord(searchParams.get("user_lng"));

  try {
    let q = supabase
      .from("stores")
      .select(
        "id, store_name, slug, region, city, district, lat, lng, profile_image_url, description, is_open, business_hours_json, created_at"
      )
      .eq("approval_status", "approved")
      .eq("is_visible", true)
      .order("created_at", { ascending: false })
      .limit(150);

    // region/district는 정렬에만 사용 (home-feed·browse와 동일 — ilike 필터는 표기 불일치로 승인 매장 누락 유발).
    if (searchQ) {
      const pat = `%${searchQ}%`;
      q = q.or(`store_name.ilike."${pat}",slug.ilike."${pat}"`);
    }

    const { data, error } = await q;

    if (error) {
      console.error("[api/stores]", error);
      return NextResponse.json(
        { ok: false, stores: [], error: error.message },
        { status: 500 }
      );
    }

    let rows = (data ?? []) as StoreRow[];

    if (userLat != null && userLng != null) {
      rows = [...rows].sort((a, b) => {
        const dr = districtRank(a.district, district) - districtRank(b.district, district);
        if (dr !== 0) return dr;
        const da = haversineKm(userLat, userLng, a.lat, a.lng);
        const db = haversineKm(userLat, userLng, b.lat, b.lng);
        if (da != null && db != null && da !== db) return da - db;
        if (da != null && db == null) return -1;
        if (da == null && db != null) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } else {
      rows = [...rows].sort((a, b) => {
        const dr = districtRank(a.district, district) - districtRank(b.district, district);
        if (dr !== 0) return dr;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }

    rows = rows.slice(0, 60);

    const storesOut = rows.map((row) => {
      const { business_hours_json: bhj, ...rest } = row;
      return {
        ...rest,
        is_open: resolveStoreFrontOpen(bhj, row.is_open),
      };
    });

    return NextResponse.json({
      ok: true,
      stores: storesOut,
      meta: {
        source: "supabase",
        q: searchQ,
        sorted_by: userLat != null && userLng != null ? "district_then_distance" : "district_then_recent",
      },
    });
  } catch (e) {
    console.error("[api/stores]", e);
    return NextResponse.json(
      { ok: false, stores: [], error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
