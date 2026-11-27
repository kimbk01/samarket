import { NextResponse } from "next/server";
import { BUNDLED_STARTUP_CONFIG } from "@/lib/startup/startup-config";
import { loadStartupConfigShared } from "@/lib/startup/startup-config-db";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  PUBLIC_CONFIG_CDN_CACHE_CONTROL,
  PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL,
} from "@/lib/http/public-config-cache-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public startup config — no auth. Used after first paint for next-launch cache.
 * D3: 모든 회원에게 같은 값 → DB 에서 읽은 응답만 CDN 60초 캐시(실행마다 DB 조회 제거). 기본값 응답은 캐시 금지.
 */
export async function GET() {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json(
      { ok: true as const, source: "default" as const, config: BUNDLED_STARTUP_CONFIG },
      { headers: { "Cache-Control": PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL } }
    );
  }

  const loaded = await loadStartupConfigShared(sb);
  if (!loaded.ok) {
    return NextResponse.json(
      { ok: true as const, source: "default" as const, config: BUNDLED_STARTUP_CONFIG },
      { headers: { "Cache-Control": PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL } }
    );
  }

  return NextResponse.json(
    { ok: true as const, source: loaded.source, config: loaded.config },
    { headers: { "Cache-Control": PUBLIC_CONFIG_CDN_CACHE_CONTROL } }
  );
}
