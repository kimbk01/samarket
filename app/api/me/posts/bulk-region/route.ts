import { POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getLocationLabel } from "@/lib/products/form-options";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { resolveBulkRegionPatchLocationForUser } from "@/lib/addresses/user-address-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const location = await resolveBulkRegionPatchLocationForUser(sb, auth.userId);
  if (!location) {
    return NextResponse.json(
      {
        ok: false,
        error: "대표·거래·생활 기본 주소 또는 프로필 지역을 먼저 설정해 주세요.",
      },
      { status: 400 },
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
