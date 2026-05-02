import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
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
    return NextResponse.json({ ok: false, error: "서버 설정이 필요합니다." }, { status: 500 });
  }

  const access = await assertVerifiedMemberForAction(sb as any, applicantId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  const { postId } = await params;
  const id = typeof postId === "string" ? postId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "postId 필요" }, { status: 400 });
  }

  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient;
  const { data: row, error: fetchErr } = await sbAny
    .from(POSTS_TABLE_READ)
    .select("id, user_id, trade_type, meta, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "글을 찾을 수 없습니다." }, { status: 404 });
  }

  const owner = String((row as { user_id?: string }).user_id ?? "");
  if (!owner || owner === applicantId) {
    return NextResponse.json({ ok: false, error: "본인 글에는 지원할 수 없습니다." }, { status: 403 });
  }

  const tradeType = String((row as { trade_type?: string }).trade_type ?? "product");
  if (tradeType !== "job") {
    return NextResponse.json({ ok: false, error: "일자리 글이 아닙니다." }, { status: 400 });
  }

  const meta =
    (row as { meta?: Record<string, unknown> | null }).meta &&
    typeof (row as { meta?: unknown }).meta === "object" &&
    !Array.isArray((row as { meta?: unknown }).meta)
      ? ((row as { meta: Record<string, unknown> }).meta as Record<string, unknown>)
      : {};
  const listingKind = String(meta.listing_kind ?? "").trim();
  if (listingKind !== "hire") {
    return NextResponse.json({ ok: false, error: "구인 공고만 지원할 수 있습니다." }, { status: 400 });
  }

  const status = String((row as { status?: string }).status ?? "");
  if (status !== "active") {
    return NextResponse.json({ ok: false, error: "지원할 수 없는 상태입니다." }, { status: 400 });
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
      return NextResponse.json(
        { ok: false, code: "duplicate_application", error: "이미 지원한 공고입니다." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: false, error: msg || "지원에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
