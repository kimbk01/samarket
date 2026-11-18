import { NextResponse } from "next/server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { listSupportCategorySettings } from "@/lib/support/support-category-settings-service";
import {
  PUBLIC_CONFIG_CDN_CACHE_CONTROL,
  PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL,
} from "@/lib/http/public-config-cache-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/support/category-settings — 고객센터 문의 유형 표시 설정(이름·순서·노출).
 * 공개 표시값만(개인정보 없음). 표가 없거나 실패하면 빈 목록 = 코드 기본값 그대로.
 * D3: 앱 셸이 실행마다 부름 → DB 에서 읽은 응답만 CDN 60초 캐시. 실패(빈 목록) 응답은 캐시 금지.
 */
export async function GET() {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json(
      { ok: true, rows: [] },
      { headers: { "Cache-Control": PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL } }
    );
  }
  const res = await listSupportCategorySettings(sb);
  const rows = res.ok
    ? res.rows.map((r) => ({
        audience: r.audience,
        category_id: r.category_id,
        issue_id: r.issue_id,
        label_ko: r.label_ko,
        label_en: r.label_en,
        sort_order: r.sort_order,
        hidden: r.hidden,
      }))
    : [];
  return NextResponse.json(
    { ok: true, rows },
    {
      headers: {
        "Cache-Control": res.ok ? PUBLIC_CONFIG_CDN_CACHE_CONTROL : PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL,
      },
    }
  );
}
