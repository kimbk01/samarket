import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { listPlatformPopupAdminCampaigns } from "@/lib/platform-popup/admin-campaign-loader";
import { createPlatformPopupAdminCampaign } from "@/lib/platform-popup/admin-campaign-writer";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/platform-popup-campaigns */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const params = new URL(req.url).searchParams;
  const status = params.get("status");
  const scope = params.get("scope") === "ptr" ? "ptr" : "popup";
  const result = await listPlatformPopupAdminCampaigns(sb, { status, scope });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, items: result.items });
}

/** POST /api/admin/platform-popup-campaigns — create draft */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    surfaces?: string[];
    priority?: number;
    timezone?: string;
    presentationType?: string;
  };

  const result = await createPlatformPopupAdminCampaign(sb, {
    adminUserId: admin.userId,
    name: String(body.name ?? "").trim(),
    surfaces: body.surfaces,
    priority: body.priority,
    timezone: body.timezone,
    presentationType: body.presentationType,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.httpStatus ?? 400 }
    );
  }
  return NextResponse.json({ ok: true, id: result.id });
}
