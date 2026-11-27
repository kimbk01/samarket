import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { tradeApiError } from "@/lib/trade/trade-api-error-response";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/posts/[postId]/job-apply — 구인 글에 지원 (job_applications)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const applicantId = auth.userId;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return tradeApiError("service_unavailable", 500);
  }

  const access = await assertVerifiedMemberForAction(sb as any, applicantId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  const { postId } = await params;
  const id = typeof postId === "string" ? postId.trim() : "";
  if (!id) {
    return tradeApiError("invalid_request", 400);
  }

  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient;
  const { data: row, error: fetchErr } = await sbAny
    .from(POSTS_TABLE_READ)
    .select("id, user_id, trade_type, meta, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    console.error("[posts/job-apply] post lookup failed", fetchErr);
    return tradeApiError("job_apply_failed", 500);
  }
  if (!row) {
    return tradeApiError("post_not_found", 404);
  }

  const owner = String((row as { user_id?: string }).user_id ?? "");
  if (!owner || owner === applicantId) {
    return tradeApiError("own_post_apply", 403);
  }

  const tradeType = String((row as { trade_type?: string }).trade_type ?? "product");
  if (tradeType !== "job") {
    return tradeApiError("not_job_post", 400);
  }

  const meta =
    (row as { meta?: Record<string, unknown> | null }).meta &&
    typeof (row as { meta?: unknown }).meta === "object" &&
    !Array.isArray((row as { meta?: unknown }).meta)
      ? ((row as { meta: Record<string, unknown> }).meta as Record<string, unknown>)
      : {};
  const listingKind = String(meta.listing_kind ?? "").trim();
  if (listingKind !== "hire") {
    return tradeApiError("not_hiring_post", 400);
  }

  const status = String((row as { status?: string }).status ?? "");
  if (status !== "active") {
    return tradeApiError("job_not_open", 400);
  }

  let message: string | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as { message?: unknown };
    if (typeof body.message === "string") message = body.message.trim().slice(0, 500) || undefined;
  } catch {
    message = undefined;
  }

  const { error: insErr } = await sbAny.from("job_applications").insert({
    post_id: id,
    applicant_id: applicantId,
    ...(message ? { message } : {}),
  });

  if (insErr) {
    const msg = insErr.message ?? "";
    if (/duplicate|unique/i.test(msg)) {
      return tradeApiError("duplicate_application", 409);
    }
    console.error("[posts/job-apply] insert failed", insErr);
    return tradeApiError("job_apply_failed", 500);
  }

  return NextResponse.json({ ok: true });
}
