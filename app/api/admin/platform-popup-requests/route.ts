import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  isPlatformPopupOwnerRequestStatus,
  type PlatformPopupOwnerRequestStatus,
} from "@/lib/platform-popup/owner-request-types";
import { listPlatformPopupOwnerRequestsForAdmin } from "@/lib/platform-popup/owner-request-loader";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/platform-popup-requests */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const sp = new URL(req.url).searchParams;
  const statusRaw = sp.get("status");
  const status: PlatformPopupOwnerRequestStatus | "open" | "all" | undefined =
    statusRaw === "open" || statusRaw === "all"
      ? statusRaw
      : statusRaw && isPlatformPopupOwnerRequestStatus(statusRaw)
        ? statusRaw
        : "open";

  const result = await listPlatformPopupOwnerRequestsForAdmin(sb, {
    status,
    storeId: sp.get("storeId") ?? undefined,
  });
  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, items: result.items });
}
