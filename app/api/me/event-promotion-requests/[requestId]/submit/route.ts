import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { submitOwnerEventPromoRequest } from "@/lib/platform-event-owner-requests/owner-writer";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ requestId: string }> };

/** POST — Owner submit for Admin review. Does not create public Event. */
export async function POST(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const { requestId } = await ctx.params;
  const submitted = await submitOwnerEventPromoRequest(sb, {
    ownerUserId: userId,
    requestId: String(requestId ?? "").trim(),
  });
  if (!submitted.ok) {
    return NextResponse.json(
      { ok: false, error: submitted.error },
      { status: submitted.httpStatus }
    );
  }
  return NextResponse.json({ ok: true, request: submitted.request });
}
