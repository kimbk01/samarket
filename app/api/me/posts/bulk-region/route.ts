import { POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolvePublicCityName } from "@/lib/addresses/address-display-levels";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { resolveTradePostLocationForUser } from "@/lib/trade/location/resolve-trade-post-location.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  /** 거래 글 위치 SSOT: 대표 주소의 시/군 LGU + 동네 칸(ID) — 화면 표시 이름이 아니라 글쓰기와 같은 값 */
  const location = await resolveTradePostLocationForUser(sb, auth.userId, null);
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
    region: location.region,
    city: location.city,
    trade_lgu_id: location.tradeLguId,
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
      regionId: location.region ?? "",
      cityId: location.city ?? "",
      /** ① 공개 지역(시/군) — 주소 표시 SSOT */
      label: resolvePublicCityName({ cityLguId: location.tradeLguId, cityText: null }) ?? "",
      barangayLabel: null,
      source: "master_address" as const,
    },
  });
}
