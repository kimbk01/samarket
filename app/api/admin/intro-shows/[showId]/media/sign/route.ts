import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { createIntroShowSignedUpload } from "@/lib/intro-show/media-pipeline";
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
  const body = (await req.json().catch(() => ({}))) as { kind?: string; mimeType?: string };
  const kind = body.kind === "LOGO" || body.kind === "IMAGE" ? body.kind : null;
  if (!kind) return NextResponse.json({ ok: false, error: "kind_invalid" }, { status: 400 });
  try {
    const signed = await createIntroShowSignedUpload(sb, {
      campaignId: showId,
      adminUserId: admin.userId,
      kind,
      mimeType: String(body.mimeType ?? ""),
    });
    return NextResponse.json({ ok: true, mediaId: signed.mediaId, signedUrl: signed.signedUrl, token: signed.token });
  } catch (error) {
    const message = error instanceof Error ? error.message : "sign_failed";
    const status = message === "mime_not_allowed" ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
