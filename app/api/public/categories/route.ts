import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { selectCategoriesWithSettings } from "@/lib/categories/query-categories-select";
import {
  PUBLIC_CONFIG_CDN_CACHE_CONTROL,
  PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL,
} from "@/lib/http/public-config-cache-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set(["trade", "service", "community", "feature"]);

/**
 * D3 (2026-11-19) — 활성 카테고리 목록(공개). 앱이 화면마다 Supabase 를 직접 조회하던 것을 같은 출처 1곳으로 모아
 * CDN 60초 캐시 → 회원 수와 무관하게 DB 조회 약 1분 1회 + 직접 조회의 CORS 사전 요청(OPTIONS) 제거.
 *
 * - 읽기 권한은 쿠키 없는 anon — 운영 RLS `categories_public_select_active`(is_active=true) ·
 *   `category_settings_public_select`(true) 범위 그대로(앱 직접 조회와 같은 결과, 추가 노출 없음).
 * - 응답 행 = `categories` + `category_settings` 원본 행(클라이언트가 기존 `toCategoryWithSettings` 로 변환).
 * - 실패 시 `ok:false` + 캐시 금지 → 클라이언트는 기존 직접 조회로 폴백.
 */
export async function GET(req: NextRequest) {
  const typeRaw = req.nextUrl.searchParams.get("type")?.trim() ?? "";
  if (typeRaw && !ALLOWED_TYPES.has(typeRaw)) {
    return NextResponse.json(
      { ok: false, error: "invalid_type" },
      { status: 400, headers: { "Cache-Control": PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL } }
    );
  }

  const env = requireSupabaseEnv({ requireAnonKey: true });
  if (!env.ok) {
    return NextResponse.json(
      { ok: false, error: "supabase_unconfigured" },
      { status: 503, headers: { "Cache-Control": PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL } }
    );
  }
  const sb = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const { data, error } = await selectCategoriesWithSettings(sb as never, (cols) => {
      let q = (sb as any).from("categories").select(cols).eq("is_active", true);
      if (typeRaw) q = q.eq("type", typeRaw);
      return q.order("sort_order", { ascending: true });
    });
    if (error || !Array.isArray(data)) {
      return NextResponse.json(
        { ok: false, error: "query_failed" },
        { status: 502, headers: { "Cache-Control": PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL } }
      );
    }
    return NextResponse.json(
      { ok: true, rows: data },
      { headers: { "Cache-Control": PUBLIC_CONFIG_CDN_CACHE_CONTROL } }
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "query_failed" },
      { status: 502, headers: { "Cache-Control": PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL } }
    );
  }
}
