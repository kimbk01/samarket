import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { PTR_REVEAL_PRESENTATION } from "@/lib/platform-popup/ptr-reveal-contract";
import { myPageBannerLiveQuerySpec } from "@/lib/my/mypage-tables-select";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/advertising/other-surfaces — Owner 결정 O-5 (2026-11-03).
 * 공통 광고 화면(「전체 광고」) 위 바로가기 카드용 **읽기 전용** 요약: 공통 목록에 없는 광고 4종의 지금 노출 수.
 * 원장·쓰기 없음 (각 화면이 관리한다). 노출 판정 = 각 화면과 같은 저장 값(상태 + 기간).
 */
export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const nowIso = new Date().toISOString();
  const inPeriod = (startCol: string, endCol: string) =>
    `and(or(${startCol}.is.null,${startCol}.lte.${nowIso}),or(${endCol}.is.null,${endCol}.gte.${nowIso}))`;

  const myBannerLive = myPageBannerLiveQuerySpec(nowIso);

  const [intro, ptr, mypage, events] = await Promise.all([
    sb.from("launch_intro_live").select("state, publication_id").limit(1).maybeSingle(),
    sb
      .from("platform_popup_campaigns")
      .select("id", { count: "exact", head: true })
      .eq("presentation_type", PTR_REVEAL_PRESENTATION)
      .eq("status", "active")
      .or(inPeriod("start_at", "end_at")),
    // MB-A03: 고객 조회와 같은 조건 함수 1개(`myPageBannerLiveQuerySpec` · is_active · 종료 순간 제외)
    sb
      .from("my_page_banners")
      .select("id", { count: "exact", head: true })
      .eq(myBannerLive.activeColumn, myBannerLive.activeValue)
      .or(myBannerLive.startOr)
      .or(myBannerLive.endOr),
    sb
      .from("platform_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .or(inPeriod("starts_at", "ends_at")),
  ]);

  const introRow = intro.data as { state?: string | null; publication_id?: string | null } | null;
  return NextResponse.json({
    ok: true,
    intro: {
      state: String(introRow?.state ?? "unpublished"),
      live: introRow?.state === "active" && Boolean(introRow?.publication_id),
    },
    ptrLive: ptr.error ? null : (ptr.count ?? 0),
    mypageBannersLive: mypage.error ? null : (mypage.count ?? 0),
    eventsLive: events.error ? null : (events.count ?? 0),
  });
}
