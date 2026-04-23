import { NextResponse } from "next/server";
import { loadMainBottomNavItemsServerCached } from "@/lib/main-menu/load-main-bottom-nav-items-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 운영에서 순서 변경이 즉시 반영되도록 — CDN/브라우저에 공개 캐시 금지 (구성은 admin_settings 에서 자주 바뀜) */
const MAIN_BOTTOM_NAV_HTTP_CACHE_CONTROL = "private, no-store, max-age=0, must-revalidate";

/** 앱 하단 탭 공개 조회 (인증 불필요) */
export async function GET() {
  const payload = await loadMainBottomNavItemsServerCached();
  return NextResponse.json(
    { ok: true as const, source: payload.source, items: payload.items },
    { headers: { "Cache-Control": MAIN_BOTTOM_NAV_HTTP_CACHE_CONTROL } }
  );
}
