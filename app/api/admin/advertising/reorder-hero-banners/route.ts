import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { reorderDeliveryHeroBannerSlides } from "@/lib/admin/ads-exposure/reorder-hero-banners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/advertising/reorder-hero-banners
 * Body: { orderedCampaignIds: string[] }
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
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
  return NextResponse.json({
    ok: true,
    orderedIds: res.orderedIds,
    message: "배너 순서를 변경했습니다.",
    messageEn: "Banner order updated.",
  });
}
