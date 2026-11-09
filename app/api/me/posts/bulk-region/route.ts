import { POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolvePublicCityName } from "@/lib/addresses/address-display-levels";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { resolveTradePostLocationForUser } from "@/lib/trade/location/resolve-trade-post-location.server";
import { deriveTradeLifecycleStatus, type TradeLifecycleStatus } from "@/lib/trade/trade-lifecycle-policy";

/** 일괄 변경 대상 = 아직 끝나지 않은 판매 글만 (L1 2026-11-09 — 이전: 판매 완료·숨김·취소 글까지 모두 변경) */
const BULK_REGION_EXCLUDED: ReadonlySet<TradeLifecycleStatus> = new Set(["completed", "hidden", "cancelled"]);

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

  const { data: rows, error: readErr } = await sb
    .from(POSTS_TABLE_WRITE)
    .select("id, status, seller_listing_state, meta")
    .eq("user_id", auth.userId);
  if (readErr) {
    return NextResponse.json({ ok: false, error: readErr.message ?? "bulk_region_update_failed" }, { status: 500 });
  }
  const targetIds = (Array.isArray(rows) ? rows : [])
    .filter(
      (r: { status?: string | null; seller_listing_state?: string | null; meta?: Record<string, unknown> | null }) =>
        !BULK_REGION_EXCLUDED.has(deriveTradeLifecycleStatus(r)),
    )
    .map((r: { id?: string }) => String(r.id ?? ""))
    .filter(Boolean);

  /** id 목록은 200개씩 나눠 보낸다(요청 길이 제한) */
  let updatedCount = 0;
  for (let i = 0; i < targetIds.length; i += 200) {
    const upd = await sb
      .from(POSTS_TABLE_WRITE)
      .update(patch)
      .eq("user_id", auth.userId)
      .in("id", targetIds.slice(i, i + 200))
      .select("id");
    if (upd.error) {
      return NextResponse.json({ ok: false, error: upd.error.message ?? "bulk_region_update_failed" }, { status: 500 });
    }
    updatedCount += Array.isArray(upd.data) ? upd.data.length : 0;
  }

  return NextResponse.json({
    ok: true,
    updatedCount,
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
