import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { listPlatformPopupOwnerRequestsForOwner } from "@/lib/platform-popup/owner-request-loader";
import { createPlatformPopupOwnerDraft } from "@/lib/platform-popup/owner-request-writer";
import { assertOwnerPlatformPopupNewSalesAllowed } from "@/lib/platform-popup/owner-popup-new-sales-gate";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/platform-popup-requests — owner list */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const storeId = new URL(req.url).searchParams.get("storeId");
  const items = await listPlatformPopupOwnerRequestsForOwner(sb, {
    ownerUserId: userId,
    storeId,
  });
  return NextResponse.json({ ok: true, items });
}

/** POST /api/me/platform-popup-requests — create draft { storeId } */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const salesGate = assertOwnerPlatformPopupNewSalesAllowed();
  if (!salesGate.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: salesGate.error,
        message:
          "Owner Popup 신규 신청은 종료되었습니다. 기존 신청 내역은 조회할 수 있습니다.",
      },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { storeId?: string };
  const storeId = String(body.storeId ?? "").trim();
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "store_id_required" }, { status: 400 });
  }

  const result = await createPlatformPopupOwnerDraft(sb, {
    ownerUserId: userId,
    storeId,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, detail: result.detail },
      { status: result.httpStatus ?? 400 }
    );
  }
  return NextResponse.json({ ok: true, item: result.row });
}
