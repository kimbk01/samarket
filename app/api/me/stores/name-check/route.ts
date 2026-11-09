import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { findStoreNameDuplicates } from "@/lib/stores/store-application-input.server";
import { STORE_APPLY_LIMITS, normalizeStoreApplyName } from "@/lib/stores/store-application-limits";
import { enforceRateLimit } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 매장 이름 중복 확인 (매장 신청 v2 · Owner 2026-11-10 「같은 이름 = 허용 + 지점명」).
 * 응답은 개수만 — 다른 매장 이름·상태는 사장님에게 보여 주지 않는다(어드민에서만).
 */
export async function GET(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const quota = await enforceRateLimit({
    key: `store_name_check:${userId}`,
    limit: 120,
    windowMs: 600_000,
    code: "rate_limited",
  });
  if (!quota.ok) return quota.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const name = normalizeStoreApplyName(req.nextUrl.searchParams.get("name") ?? "");
  if (name.length < STORE_APPLY_LIMITS.shopNameMin || name.length > STORE_APPLY_LIMITS.shopNameMax) {
    return NextResponse.json({ ok: true, duplicateCount: 0, checked: false });
  }
  let exclude: string | null = (req.nextUrl.searchParams.get("excludeStoreId") ?? "").trim() || null;
  if (exclude) {
    const { data: own } = await sb.from("stores").select("id").eq("id", exclude).eq("owner_user_id", userId).maybeSingle();
    if (!own) exclude = null;
  }
  const r = await findStoreNameDuplicates(sb, name, exclude);
  if (!r.ok) return NextResponse.json({ ok: false, error: "name_check_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, duplicateCount: r.rows.length, checked: true });
}
