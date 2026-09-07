import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { submitPlatformPopupOwnerRequest } from "@/lib/platform-popup/owner-request-writer";
import { assertOwnerPlatformPopupNewSalesAllowed } from "@/lib/platform-popup/owner-popup-new-sales-gate";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/me/platform-popup-requests/[requestId]/submit { idempotencyKey } */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ requestId: string }> }
): Promise<NextResponse> {
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

  const { requestId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { idempotencyKey?: string };
  const idempotencyKey = String(body.idempotencyKey ?? "").trim();

  const result = await submitPlatformPopupOwnerRequest(sb, {
    requestId,
    ownerUserId: userId,
    idempotencyKey,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        detail: result.detail,
        insufficient: result.insufficient,
      },
      { status: result.httpStatus ?? 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    item: result.row,
    idempotent: result.idempotent === true,
  });
}
