import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { readIntroShowMediaFile } from "@/lib/intro-show/media-pipeline";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ showId: string; mediaId: string }> },
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const { showId, mediaId } = await context.params;
  const variantRaw = new URL(req.url).searchParams.get("variant") ?? "thumb";
  const variant = variantRaw === "runtime" || variantRaw === "source" ? variantRaw : "thumb";
  const file = await readIntroShowMediaFile(sb, { campaignId: showId, mediaId, variant });
  if (!file) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(file.buf), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, max-age=60",
    },
  });
}
