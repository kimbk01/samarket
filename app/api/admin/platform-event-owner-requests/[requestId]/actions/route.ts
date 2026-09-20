import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { adminActOnOwnerEventPromoRequest } from "@/lib/platform-event-owner-requests/admin-review";
import { isPlatformEventOwnerAdminAction } from "@/lib/platform-event-owner-requests/types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ requestId: string }> };

/**
 * POST { action, reason? }
 * approve → Platform Event draft link; pushDispatchCount always 0.
 */
export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const { requestId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    reason?: string;
  };
  const action = String(body.action ?? "").trim();
  if (!isPlatformEventOwnerAdminAction(action)) {
    return NextResponse.json({ ok: false, error: "action_invalid" }, { status: 400 });
  }

  const result = await adminActOnOwnerEventPromoRequest(sb, {
    adminUserId: admin.userId,
    requestId: String(requestId ?? "").trim(),
    action,
    reason: body.reason,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });
  }

  if ("platformEventId" in result) {
    return NextResponse.json({
      ok: true,
      request: result.request,
      platformEventId: result.platformEventId,
      replay: result.replay,
      pushDispatchCount: result.pushDispatchCount,
      distributionConfigured: result.distributionConfigured,
      eventStatus: result.eventStatus,
      distributionHandoffPath: `/admin/platform-events/${encodeURIComponent(result.platformEventId)}`,
    });
  }

  return NextResponse.json({ ok: true, request: result.request });
}
