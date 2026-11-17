import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { lookupPlatformPopupAdminDestination } from "@/lib/platform-popup/admin-destination-lookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v3 ④ — GET /api/admin/platform-popup-campaigns/destination-lookup?ctaType=&ctaTarget=&externalUrl=
 * 저장 전 「누르면 이동」 대상 확인: 제목 + 공개 여부. 앱 조회와 같은 공개 판정(`popup-event-destination-availability.ts`).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const p = req.nextUrl.searchParams;
  const result = await lookupPlatformPopupAdminDestination(sb, {
    ctaType: p.get("ctaType") ?? "",
    ctaTarget: p.get("ctaTarget") ?? "",
    externalUrl: p.get("externalUrl") ?? "",
  });
  return NextResponse.json({ ok: true, ...result });
}
