import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getIntroShowDraft, saveIntroShowDraft } from "@/lib/intro-show/admin-store";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ showId: string }> },
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const { showId } = await context.params;
  try {
    const draft = await getIntroShowDraft(sb, showId);
    if (!draft) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, ...draft });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "get_failed" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ showId: string }> },
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const { showId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as { title?: string; document?: unknown };
  try {
    const saved = await saveIntroShowDraft(sb, {
      campaignId: showId,
      adminUserId: admin.userId,
      title: String(body.title ?? ""),
      document: body.document,
    });
    if (!saved.equal) {
      return NextResponse.json({ ok: false, error: "semantic_mismatch" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      document: saved.document,
      requestCanonical: saved.requestCanonical,
      storedCanonical: saved.storedCanonical,
      freshCanonical: saved.freshCanonical,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "save_failed";
    const status = message === "document_invalid" || message === "title_required" ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
