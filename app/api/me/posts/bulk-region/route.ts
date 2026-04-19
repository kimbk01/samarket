import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getLocationLabel, REGIONS } from "@/lib/products/form-options";
import { decodeProfileAppLocationPair } from "@/lib/profile/profile-location";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResolvedLocation = {
  regionId: string;
  cityId: string;
  regionLabel: string;
  cityLabel: string;
  barangayLabel: string | null;
  source: "trade_address" | "life_address" | "profile";
};

function getCityName(regionId: string, cityId: string): string {
  return REGIONS.find((region) => region.id === regionId)?.cities.find((city) => city.id === cityId)?.name ?? "";
}

async function resolveTargetLocation(userId: string): Promise<ResolvedLocation | null> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return null;

  const addressSelect = "app_region_id, app_city_id, neighborhood_name";
  const [{ data: tradeAddress }, { data: lifeAddress }, { data: profile }] = await Promise.all([
    sb
      .from("user_addresses")
      .select(addressSelect)
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("is_default_trade", true)
      .maybeSingle(),
    sb
      .from("user_addresses")
      .select(addressSelect)
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("is_default_life", true)
      .maybeSingle(),
    sb.from("profiles").select("region_code, region_name").eq("id", userId).maybeSingle(),
  ]);

  const fromAddress = (
    row: Record<string, unknown> | null | undefined,
    source: ResolvedLocation["source"]
  ): ResolvedLocation | null => {
    const regionId = String(row?.app_region_id ?? "").trim();
    const cityId = String(row?.app_city_id ?? "").trim();
    if (!regionId || !cityId) return null;
    const regionLabel = REGIONS.find((region) => region.id === regionId)?.name ?? regionId;
    const cityLabel = getCityName(regionId, cityId) || cityId;
    return {
      regionId,
      cityId,
      regionLabel,
      cityLabel,
      barangayLabel: String(row?.neighborhood_name ?? "").trim() || null,
      source,
    };
  };

  const trade = fromAddress(tradeAddress as Record<string, unknown> | null, "trade_address");
  if (trade) return trade;

  const life = fromAddress(lifeAddress as Record<string, unknown> | null, "life_address");
  if (life) return life;

  const profileLocation = decodeProfileAppLocationPair(
    typeof profile?.region_code === "string" ? profile.region_code : null,
    typeof profile?.region_name === "string" ? profile.region_name : null
  );
  if (!profileLocation.regionId || !profileLocation.cityId) return null;

  return {
    regionId: profileLocation.regionId,
    cityId: profileLocation.cityId,
    regionLabel: REGIONS.find((region) => region.id === profileLocation.regionId)?.name ?? profileLocation.regionId,
    cityLabel: getCityName(profileLocation.regionId, profileLocation.cityId) || profileLocation.cityId,
    barangayLabel: null,
    source: "profile",
  };
}

export async function POST() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const location = await resolveTargetLocation(auth.userId);
  if (!location) {
    return NextResponse.json(
      {
        ok: false,
        error: "거래 기본 주소 또는 프로필 지역을 먼저 설정해 주세요.",
      },
      { status: 400 }
    );
  }

  const patch = {
    region: location.regionLabel,
    city: location.cityLabel,
    barangay: location.barangayLabel,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb.from(POSTS_TABLE_WRITE).update(patch).eq("user_id", auth.userId).select("id");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message ?? "bulk_region_update_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    updatedCount: Array.isArray(data) ? data.length : 0,
    location: {
      regionId: location.regionId,
      cityId: location.cityId,
      label: getLocationLabel(location.regionId, location.cityId),
      barangayLabel: location.barangayLabel,
      source: location.source,
    },
  });
}
