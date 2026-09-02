import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { loadPlatformPopupOwnerRequest } from "@/lib/platform-popup/owner-request-loader";
import {
  cancelPlatformPopupOwnerRequest,
  updatePlatformPopupOwnerDraft,
} from "@/lib/platform-popup/owner-request-writer";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/platform-popup-requests/[requestId] */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ requestId: string }> }
): Promise<NextResponse> {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const { requestId } = await ctx.params;
  const row = await loadPlatformPopupOwnerRequest(sb, requestId);
  if (!row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (row.ownerUserId !== userId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, item: row });
}

/** PATCH /api/me/platform-popup-requests/[requestId] — update draft or cancel */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ requestId: string }> }
): Promise<NextResponse> {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const { requestId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.action === "cancel") {
    const result = await cancelPlatformPopupOwnerRequest(sb, {
      requestId,
      ownerUserId: userId,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, detail: result.detail },
        { status: result.httpStatus ?? 400 }
      );
    }
    return NextResponse.json({ ok: true, item: result.row });
  }

  const result = await updatePlatformPopupOwnerDraft(sb, {
    requestId,
    ownerUserId: userId,
    patch: {
      packageId:
        typeof body.packageId === "string"
          ? body.packageId
          : body.packageId === null
            ? null
            : undefined,
      surfaces: Array.isArray(body.surfaces)
        ? body.surfaces.map((s) => String(s))
        : undefined,
      startAt:
        "startAt" in body
          ? body.startAt == null
            ? null
            : String(body.startAt)
          : undefined,
      endAt:
        "endAt" in body ? (body.endAt == null ? null : String(body.endAt)) : undefined,
      timezone: typeof body.timezone === "string" ? body.timezone : undefined,
      ctaType: typeof body.ctaType === "string" ? body.ctaType : undefined,
      ctaTarget: typeof body.ctaTarget === "string" ? body.ctaTarget : undefined,
      externalUrl:
        "externalUrl" in body
          ? body.externalUrl == null
            ? null
            : String(body.externalUrl)
          : undefined,
      suppressionMode:
        typeof body.suppressionMode === "string" ? body.suppressionMode : undefined,
      suppressionDurationSeconds:
        "suppressionDurationSeconds" in body
          ? body.suppressionDurationSeconds == null
            ? null
            : Number(body.suppressionDurationSeconds)
          : undefined,
      creativeAssetPath:
        "creativeAssetPath" in body
          ? body.creativeAssetPath == null
            ? null
            : String(body.creativeAssetPath)
          : undefined,
      creativeAssetUrl:
        "creativeAssetUrl" in body
          ? body.creativeAssetUrl == null
            ? null
            : String(body.creativeAssetUrl)
          : undefined,
      creativeAltText:
        "creativeAltText" in body
          ? body.creativeAltText == null
            ? null
            : String(body.creativeAltText)
          : undefined,
    },
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, detail: result.detail },
      { status: result.httpStatus ?? 400 }
    );
  }
  return NextResponse.json({ ok: true, item: result.row });
}
