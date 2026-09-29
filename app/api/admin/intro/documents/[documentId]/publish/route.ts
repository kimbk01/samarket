import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  PublishConflictError,
  PublishFailedOpError,
  PublishNotFoundError,
  PublishSealCollisionError,
  PublishValidationError,
} from "@/lib/intro/publish/errors";
import {
  assertLiveInert,
  publishIntroDocument,
} from "@/lib/intro/publish/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ documentId: string }> };

/**
 * POST /api/admin/intro/documents/[documentId]/publish
 * Body: { sourceDraftVersion, idempotencyKey }
 *
 * Creates immutable Published revision + sealed assets + canonical Pack.
 * Does NOT Set Live. Publish ≠ Live. Publish ≠ 앱 적용.
 */
export async function POST(req: NextRequest, ctx: RouteCtx) {
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
    sourceDraftVersion?: number;
    idempotencyKey?: string;
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
    typeof body.sourceDraftVersion !== "number" ||
    !Number.isInteger(body.sourceDraftVersion) ||
    body.sourceDraftVersion < 1
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid_source_draft_version" },
      { status: 400 },
    );
  }
  if (
    typeof body.idempotencyKey !== "string" ||
    body.idempotencyKey.trim().length < 8
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid_idempotency_key" },
      { status: 400 },
    );
  }

  try {
    const result = await publishIntroDocument({
      sb,
      userId: admin.userId,
      documentId,
      sourceDraftVersion: body.sourceDraftVersion,
      idempotencyKey: body.idempotencyKey.trim(),
    });
    const live = await assertLiveInert(sb);
    return NextResponse.json({
      ...result,
      ok: true as const,
      liveInert: live.inert,
      liveKind: live.liveKind,
      // Explicit product language — never claim Admin→App PASS
      verdict: {
        adminToPack: result.nativeConsumability.ok ? "PASS" : "FAIL",
        adminToApp: "NOT_PROVEN",
        setLive: false,
        appExposure: "NOT_AVAILABLE_IN_V1",
      },
    });
  } catch (err) {
    if (err instanceof PublishNotFoundError) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 },
      );
    }
    if (err instanceof PublishValidationError) {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_failed",
          issues: err.issues,
        },
        { status: 400 },
      );
    }
    if (err instanceof PublishConflictError) {
      return NextResponse.json(
        {
          ok: false,
          error: "conflict",
          code: err.code,
          message: err.message,
        },
        { status: 409 },
      );
    }
    if (err instanceof PublishFailedOpError) {
      return NextResponse.json(
        {
          ok: false,
          error: "publish_operation_failed",
          publishOperationId: err.publishOperationId,
          failureCode: err.failureCode,
          failureMessage: err.failureMessage,
        },
        { status: 409 },
      );
    }
    if (err instanceof PublishSealCollisionError) {
      return NextResponse.json(
        {
          ok: false,
          error: "seal_collision",
          message: err.message,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "publish_failed",
        message: err instanceof Error ? err.message : "publish_failed",
      },
      { status: 500 },
    );
  }
}
