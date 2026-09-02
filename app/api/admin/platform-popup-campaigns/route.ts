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

  const status = new URL(req.url).searchParams.get("status");
  const result = await listPlatformPopupAdminCampaigns(sb, { status });
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
  };

  const result = await createPlatformPopupAdminCampaign(sb, {
    adminUserId: admin.userId,
    name: String(body.name ?? "").trim() || "Untitled popup",
    surfaces: body.surfaces,
    priority: body.priority,
    timezone: body.timezone,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.httpStatus ?? 400 }
    );
  }
  return NextResponse.json({ ok: true, id: result.id });
}
