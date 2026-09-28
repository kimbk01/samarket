import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { saveOpeningDraft } from "@/lib/opening-show/admin-writer.server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ showId: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const { showId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    document?: unknown;
  };
  const result = await saveOpeningDraft(sb, {
    showId,
    adminUserId: admin.userId,
    title: String(body.title ?? ""),
    document: body.document,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });
  }
  return NextResponse.json({ ok: true, document: result.document });
}
