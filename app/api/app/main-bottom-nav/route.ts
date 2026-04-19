import { NextResponse } from "next/server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { MAIN_BOTTOM_NAV_SETTINGS_KEY } from "@/lib/main-menu/main-bottom-nav-key";
import { resolveMainBottomNavDisplayItems } from "@/lib/main-menu/resolve-main-bottom-nav";
import { overlayBottomNavLabelsFromTradeCategories } from "@/lib/main-menu/overlay-bottom-nav-labels-from-trade-categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 운영에서 순서 변경이 즉시 반영되도록 — CDN/브라우저에 공개 캐시 금지 (구성은 admin_settings 에서 자주 바뀜) */
const MAIN_BOTTOM_NAV_HTTP_CACHE_CONTROL = "private, no-store, max-age=0, must-revalidate";

async function respondWithOverlay(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>,
  valueJson: unknown,
  source: "db" | "default"
) {
  const resolved = resolveMainBottomNavDisplayItems(valueJson);
  let items = await overlayBottomNavLabelsFromTradeCategories(sb, resolved);
  /** `/market/…` 만 있던 구성이 전부 유효하지 않으면(삭제 등) 기본 탭으로 되돌림 */
  if (items.length === 0) {
    items = await overlayBottomNavLabelsFromTradeCategories(sb, resolveMainBottomNavDisplayItems(null));
  }
  return NextResponse.json(
    { ok: true as const, source, items },
    { headers: { "Cache-Control": MAIN_BOTTOM_NAV_HTTP_CACHE_CONTROL } }
  );
}

/** 앱 하단 탭 공개 조회 (인증 불필요) */
export async function GET() {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json(
      {
        ok: true as const,
        source: "default" as const,
        items: resolveMainBottomNavDisplayItems(null),
      },
      { headers: { "Cache-Control": MAIN_BOTTOM_NAV_HTTP_CACHE_CONTROL } }
    );
  }

  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", MAIN_BOTTOM_NAV_SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) {
      return respondWithOverlay(sb, null, "default");
    }
    console.warn("[GET main-bottom-nav]", error.message);
    return respondWithOverlay(sb, null, "default");
  }

  const valueJson = data?.value_json ?? null;
  return respondWithOverlay(sb, valueJson, valueJson ? "db" : "default");
}
