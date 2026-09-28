import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { seedDibayLogoMedia } from "@/lib/intro-show/media-pipeline";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ showId: string }> },
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const { showId } = await context.params;
  void req;
  try {
    const seeded = await seedDibayLogoMedia(sb, { campaignId: showId, adminUserId: admin.userId });
    return NextResponse.json({ ok: true, ...seeded, status: "ready", kind: "LOGO" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "seed_failed" },
      { status: 500 },
    );
  }
}
