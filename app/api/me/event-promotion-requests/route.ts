import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import {
  createOwnerEventPromoDraft,
  listOwnerEventPromoRequests,
} from "@/lib/platform-event-owner-requests/owner-writer";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/event-promotion-requests?storeId= */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const storeId = new URL(req.url).searchParams.get("storeId");
  try {
    const items = await listOwnerEventPromoRequests(sb, {
      ownerUserId: userId,
      storeId,
    });
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "failed" },
      { status: 500 }
    );
  }
}

/** POST { storeId, title? } — create draft; ownership enforced server-side. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { storeId?: string; title?: string };
  const storeId = String(body.storeId ?? "").trim();
  if (!storeId) return NextResponse.json({ ok: false, error: "store_id_required" }, { status: 400 });

  const created = await createOwnerEventPromoDraft(sb, {
    ownerUserId: userId,
    storeId,
    title: body.title,
  });
  if (!created.ok) {
    return NextResponse.json(
      { ok: false, error: created.error },
      { status: created.httpStatus }
    );
  }
  return NextResponse.json({ ok: true, request: created.request });
}
