import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { reorderDeliveryHeroBannerSlides } from "@/lib/admin/ads-exposure/reorder-hero-banners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/advertising/reorder-hero-banners
 * Body: { orderedCampaignIds: string[] }
 */
export async function POST(req: NextRequest) {
  // 재감사 D-5: 배달 홈 상단 배너 순서 = 배달 광고 쓰기와 같은 business 키
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const admin = { userId: gate.actor.userId };
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    orderedCampaignIds?: string[];
  };
  const ids = Array.isArray(body.orderedCampaignIds) ? body.orderedCampaignIds : [];
  const res = await reorderDeliveryHeroBannerSlides(sb, {
    adminUserId: admin.userId,
    orderedCampaignIds: ids,
  });
  if (!res.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: res.error,
        detail: res.detail,
        message: "배너 순서를 저장하지 못했습니다.",
        messageEn: "Could not save banner order.",
      },
      { status: 400 }
    );
  }
  await appendAdminRouteAudit(sb, req, {
    actorId: admin.userId,
    targetType: "delivery_hero_banner_slides",
    targetId: "delivery_hero",
    action: "hero_banners.reorder",
    before: { requested_order: ids },
    after: { ordered_ids: res.orderedIds },
  });
  return NextResponse.json({
    ok: true,
    orderedIds: res.orderedIds,
    message: "배너 순서를 변경했습니다.",
    messageEn: "Banner order updated.",
  });
}
