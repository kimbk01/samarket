import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { applyIntroServiceFromDraft } from "@/lib/intro/live/apply-service";
import { humanizeAuthoringError } from "@/lib/startup-compositor/admin/human-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner atomic 서비스 적용.
 * Draft → Release → Package → Live in one operation.
 * Do not require a separate Publish click.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ documentId: string }> },
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const { documentId } = await ctx.params;
  if (!documentId) {
    return NextResponse.json({ ok: false, error: "missing_documentId" }, { status: 400 });
  }

  let idempotencyKey: string | undefined;
  try {
    const body = (await req.json()) as { idempotencyKey?: string };
    if (typeof body.idempotencyKey === "string" && body.idempotencyKey.trim()) {
      idempotencyKey = body.idempotencyKey.trim();
    }
  } catch {
    // empty body OK
  }

  try {
    const result = await applyIntroServiceFromDraft(sb, {
      documentId,
      userId: admin.userId,
      idempotencyKey,
    });
    return NextResponse.json({
      ok: true as const,
      ...result,
      note: "SERVICE_APPLIED_SERVER_LIVE — device cold-start must refresh Live without manual clear",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "apply_service_failed";
    let status = 500;
    if ((e as { status?: number }).status === 409) status = 409;
    else if (msg.startsWith("apply_forbidden_content_class:")) status = 403;
    return NextResponse.json(
      {
        ok: false,
        error: humanizeAuthoringError(msg),
        reason: msg,
      },
      { status },
    );
  }
}
