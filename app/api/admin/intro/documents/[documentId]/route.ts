import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { IntroDocumentV1 } from "@/lib/intro/contracts/document";
import {
  DocumentConflictError,
  DocumentNotFoundError,
  DocumentValidationError,
  getIntroDocument,
  saveIntroDocument,
} from "@/lib/intro/document/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ documentId: string }> };

/** GET /api/admin/intro/documents/[documentId] */
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
    const record = await getIntroDocument({ sb, documentId });
    return NextResponse.json({ ok: true as const, ...record });
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
        error: "get_failed",
        message: err instanceof Error ? err.message : "get_failed",
      },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/admin/intro/documents/[documentId]
 * Body: { expectedDraftVersion, document }
 * 409 on draftVersion conflict.
 */
export async function PUT(req: NextRequest, ctx: RouteCtx) {
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

  let body: {
    expectedDraftVersion?: number;
    document?: IntroDocumentV1;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  if (
    typeof body.expectedDraftVersion !== "number" ||
    !Number.isInteger(body.expectedDraftVersion) ||
    body.expectedDraftVersion < 1
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid_expected_draft_version" },
      { status: 400 },
    );
  }
  if (!body.document || typeof body.document !== "object") {
    return NextResponse.json(
      { ok: false, error: "missing_document" },
      { status: 400 },
    );
  }

  try {
    const saved = await saveIntroDocument({
      sb,
      userId: admin.userId,
      documentId,
      expectedDraftVersion: body.expectedDraftVersion,
      document: body.document,
    });
    return NextResponse.json({ ok: true as const, ...saved });
  } catch (err) {
    if (err instanceof DocumentConflictError) {
      return NextResponse.json(
        {
          ok: false,
          error: "conflict",
          code: "DRAFT_VERSION_CONFLICT",
          currentDraftVersion: err.currentDraftVersion,
        },
        { status: 409 },
      );
    }
    if (err instanceof DocumentNotFoundError) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 },
      );
    }
    if (err instanceof DocumentValidationError) {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_failed",
          issues: err.issues,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "save_failed",
        message: err instanceof Error ? err.message : "save_failed",
      },
      { status: 500 },
    );
  }
}
