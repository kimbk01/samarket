import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  LiveConflictError,
  LiveNotFoundError,
  LiveValidationError,
  getLiveAuthority,
  disableLiveIntro,
} from "@/lib/intro/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/intro/live/disable
 * Body: { expectedLiveKind, expectedPublishedRevisionId }
 * → NO_LIVE_INTRO (distinct from NEVER_CONFIGURED / fetch failure).
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
    expectedLiveKind?: string;
    expectedPublishedRevisionId?: string | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  if (typeof body.expectedLiveKind !== "string" || !body.expectedLiveKind) {
    return NextResponse.json(
      { ok: false, error: "invalid_expected_live_kind" },
      { status: 400 },
    );
  }

  try {
    const live = await disableLiveIntro({
      sb,
      userId: admin.userId,
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
      live,
      verdict: { serverLive: "NO_LIVE_INTRO", adminToApp: "NOT_PROVEN" },
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
        error: "disable_live_failed",
        message: err instanceof Error ? err.message : "disable_live_failed",
      },
      { status: 500 },
    );
  }
}
