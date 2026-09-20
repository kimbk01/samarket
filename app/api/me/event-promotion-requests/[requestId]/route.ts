import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import {
  cancelOwnerEventPromoRequest,
  getOwnerEventPromoRequest,
  updateOwnerEventPromoDraft,
} from "@/lib/platform-event-owner-requests/owner-writer";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ requestId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const { requestId } = await ctx.params;
  const loaded = await getOwnerEventPromoRequest(sb, {
    ownerUserId: userId,
    requestId: String(requestId ?? "").trim(),
  });
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error }, { status: loaded.httpStatus });
  }
  return NextResponse.json({ ok: true, request: loaded.request });
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const { requestId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const updated = await updateOwnerEventPromoDraft(sb, {
    ownerUserId: userId,
    requestId: String(requestId ?? "").trim(),
    patch: {
      title: body.title as string | undefined,
      subtitle: body.subtitle as string | null | undefined,
      heroImageUrl: body.heroImageUrl as string | null | undefined,
      heroImagePath: body.heroImagePath as string | null | undefined,
      body: body.body as string | null | undefined,
      benefitTitle: body.benefitTitle as string | null | undefined,
      benefitBody: body.benefitBody as string | null | undefined,
      requestedStartsAt: body.requestedStartsAt as string | null | undefined,
      requestedEndsAt: body.requestedEndsAt as string | null | undefined,
      destinationType: body.destinationType as never,
      destinationTarget: body.destinationTarget as string | undefined,
      requestedChannels: body.requestedChannels as never,
    },
  });
  if (!updated.ok) {
    return NextResponse.json({ ok: false, error: updated.error }, { status: updated.httpStatus });
  }
  return NextResponse.json({ ok: true, request: updated.request });
}

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const { requestId } = await ctx.params;
  const cancelled = await cancelOwnerEventPromoRequest(sb, {
    ownerUserId: userId,
    requestId: String(requestId ?? "").trim(),
  });
  if (!cancelled.ok) {
    return NextResponse.json(
      { ok: false, error: cancelled.error },
      { status: cancelled.httpStatus }
    );
  }
  return NextResponse.json({ ok: true, request: cancelled.request });
}
