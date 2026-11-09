import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  buildStorePartnerOfferForApplication,
  resolveStoreTaxonomyIdsBySlug,
} from "@/lib/stores/partner/store-partner-agreement.server";
import { normalizePartnerLocale } from "@/lib/stores/partner/store-partner-agreement-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOrNull(v: string | null): string | null {
  const s = (v ?? "").trim();
  return UUID_RE.test(s) ? s : null;
}

/**
 * 매장 입점·수수료 약관 + 조건 (로그인 필요) — 입점 신청서 서약 섹션.
 * Query: categoryId·topicId (uuid) 또는 categorySlug·topicSlug (신청서 업종 선택값 — 신청 API 와 같은 조회), locale=ko|en
 * 응답: 게시된 약관(id·version·title·body) 또는 null, 배달 오픈 관리 무료 종료일(진행 중일 때만), 무료 후 요율(SQL 함수).
 */
export async function GET(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const sp = req.nextUrl.searchParams;
  const locale = normalizePartnerLocale(sp.get("locale"));
  let categoryId = uuidOrNull(sp.get("categoryId"));
  let topicId = uuidOrNull(sp.get("topicId"));
  const categorySlug = (sp.get("categorySlug") ?? "").trim();
  const topicSlug = (sp.get("topicSlug") ?? "").trim();
  if (!categoryId && !topicId && categorySlug && topicSlug) {
    ({ categoryId, topicId } = await resolveStoreTaxonomyIdsBySlug(sb, categorySlug, topicSlug));
  }

  const res = await buildStorePartnerOfferForApplication(sb, { locale, categoryId, topicId });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  return NextResponse.json(
    { ok: true as const, ...res.offer },
    { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } }
  );
}
