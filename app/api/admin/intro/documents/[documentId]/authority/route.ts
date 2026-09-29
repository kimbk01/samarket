import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { DocumentNotFoundError } from "@/lib/intro/document/service";
import { getDocumentRevisionAuthority } from "@/lib/intro/document/revision-authority";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ documentId: string }> };

/**
 * GET /api/admin/intro/documents/[documentId]/authority
 *
 * Canonical Admin revision authority for Service Apply:
 *   draft | latestPublished (COMMITTED for this document) | live
 * Never inferred from session / hardcoded UUID.
 */
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { documentId } = await ctx.params;
  if (!documentId) {
    return NextResponse.json(
      { ok: false, error: "missing_document_id" },
      { status: 400 },
    );
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json(
      { ok: false, error: "server_misconfigured" },
      { status: 503 },
    );
  }

  try {
    const authority = await getDocumentRevisionAuthority(sb, documentId);
    return NextResponse.json({ ok: true as const, authority });
  } catch (err) {
    if (err instanceof DocumentNotFoundError) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "authority_failed",
        message: err instanceof Error ? err.message : "authority_failed",
      },
      { status: 500 },
    );
  }
}
