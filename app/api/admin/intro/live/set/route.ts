import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  LiveConflictError,
  LiveNotFoundError,
  LiveValidationError,
  getLiveAuthority,
  setLiveToCommittedRevision,
} from "@/lib/intro/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/intro/live/set
 * Body: {
 *   publishedRevisionId,
 *   expectedLiveKind,
 *   expectedPublishedRevisionId,
 *   documentId?  — when present, revision MUST belong to this document
 * }
 *
 * Set Live for COMMITTED revision only. Does NOT claim devices already downloaded.
 * Does NOT trust arbitrary client UUID without document / COMMITTED / pack checks.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json(
      { ok: false, error: "server_misconfigured" },
      { status: 503 },
    );
  }

  let body: {
    publishedRevisionId?: string;
    expectedLiveKind?: string;
    expectedPublishedRevisionId?: string | null;
    documentId?: string;
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
    typeof body.publishedRevisionId !== "string" ||
    !body.publishedRevisionId.trim()
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid_published_revision_id" },
      { status: 400 },
    );
  }
  if (typeof body.expectedLiveKind !== "string" || !body.expectedLiveKind) {
    return NextResponse.json(
      { ok: false, error: "invalid_expected_live_kind" },
      { status: 400 },
    );
  }
  if (
    body.expectedPublishedRevisionId !== null &&
    body.expectedPublishedRevisionId !== undefined &&
    typeof body.expectedPublishedRevisionId !== "string"
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid_expected_published_revision_id" },
      { status: 400 },
    );
  }
  if (
    body.documentId !== undefined &&
    (typeof body.documentId !== "string" || !body.documentId.trim())
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid_document_id" },
      { status: 400 },
    );
  }

  try {
    const result = await setLiveToCommittedRevision({
      sb,
      userId: admin.userId,
      publishedRevisionId: body.publishedRevisionId.trim(),
      expectedDocumentId: body.documentId?.trim(),
      cas: {
        expectedLiveKind: body.expectedLiveKind,
        expectedPublishedRevisionId:
          body.expectedPublishedRevisionId === undefined
            ? null
            : body.expectedPublishedRevisionId,
      },
    });
    return NextResponse.json({
      ok: true as const,
      live: result.live,
      authority: result.authority,
      verdict: {
        serverLive: "PASS",
        devicesDownloaded: "NOT_CLAIMED",
        adminToApp: "NOT_PROVEN",
      },
    });
  } catch (err) {
    if (err instanceof LiveNotFoundError) {
      return NextResponse.json(
        { ok: false, error: "not_found", code: err.code },
        { status: 404 },
      );
    }
    if (err instanceof LiveValidationError) {
      return NextResponse.json(
        { ok: false, error: "validation_failed", code: err.code, message: err.message },
        { status: 400 },
      );
    }
    if (err instanceof LiveConflictError) {
      const live = await getLiveAuthority(sb).catch(() => null);
      return NextResponse.json(
        {
          ok: false,
          error: "conflict",
          code: err.code,
          message: err.message,
          live,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "set_live_failed",
        message: err instanceof Error ? err.message : "set_live_failed",
      },
      { status: 500 },
    );
  }
}
