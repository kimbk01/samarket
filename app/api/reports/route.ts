import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/reports — 통합 신고 접수 (public.reports)
 * 서비스 롤로 삽입. 신고자 ID는 세션(또는 로컬 테스트 쿠키)에서만 결정.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { enforceUserReportQuota } from "@/lib/security/rate-limit-presets";

const TARGET_TYPES = ["user", "product", "chat_room", "chat_message", "post", "comment", "feed_ad"] as const;

/** 오류는 코드만(`error`=`code`) — 문구는 화면이 `UNIFIED_REPORT_ERROR_KEYS` 로 고른다 (재감사 2026-11-27). 원인은 로그로만. */
function reportError(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code, code }, { status });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;

  const reportRl = await enforceUserReportQuota(auth.userId, "unified");
  if (!reportRl.ok) return reportRl.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return reportError("server_config", 500);
  }

  let body: {
    targetType?: string;
    targetId?: string;
    roomId?: string | null;
    productId?: string | null;
    reasonCode?: string;
    reasonText?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return reportError("invalid_json", 400);
  }

  const reporterId = auth.userId;
  const targetType = body.targetType?.trim();
  const targetId = body.targetId?.trim();
  const reasonCode = body.reasonCode?.trim();
  if (!targetType || !TARGET_TYPES.includes(targetType as (typeof TARGET_TYPES)[number])) {
    return reportError("target_type_required", 400);
  }
  if (!targetId) {
    return reportError("target_required", 400);
  }
  if (!reasonCode) {
    return reportError("reason_code_required", 400);
  }

  const sbAny = sb;

  let productId: string | null = body.productId?.trim() || null;

  if (targetType === "product" || targetType === "post") {
    const { data: post, error: postErr } = await sbAny.from(POSTS_TABLE_READ).select("id").eq("id", targetId).maybeSingle();
    if (postErr) {
      console.error("[reports] post_lookup_failed", postErr.message);
      return reportError("report_failed", 500);
    }
    if (!post) {
      return reportError("post_not_found", 404);
    }
    if (targetType === "product" && !productId) productId = targetId;
    if (targetType === "post") productId = targetId;
  }

  if (targetType === "comment") {
    const { data: cRow, error: cErr } = await sbAny
      .from("comments")
      .select("id, post_id")
      .eq("id", targetId)
      .maybeSingle();
    if (cErr) {
      console.error("[reports] comment_lookup_failed", cErr.message);
      return reportError("report_failed", 500);
    }
    const c = cRow as { id?: string; post_id?: string } | null;
    if (!c?.post_id) {
      return reportError("comment_not_found", 404);
    }
    productId = c.post_id;
  }

  if (targetType === "feed_ad") {
    const { data: ad, error: adErr } = await sbAny
      .from("feed_ad_campaigns")
      .select("id")
      .eq("id", targetId)
      .maybeSingle();
    if (adErr) {
      console.error("[reports] feed_ad_lookup_failed", adErr.message);
      return reportError("report_failed", 500);
    }
    if (!ad) {
      return reportError("ad_not_found", 404);
    }
    productId = null;
  }

  /**
   * P-2 (거래 글 신고) + D-17 (광고 신고 · 재감사 3차 2026-11-07): 같은 신고자·같은 대상은 한 번만 접수 — 다시 누르면 기존 접수를 돌려준다.
   * 커뮤니티 글·댓글·사용자·채팅 신고는 기존 동작 그대로(범위 밖).
   */
  const oncePerReporter = targetType === "product" || targetType === "feed_ad";
  const { data: existing } = !oncePerReporter ? { data: null } : await sbAny
    .from("reports")
    .select("id")
    .eq("reporter_id", reporterId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .limit(1)
    .maybeSingle();
  if (existing && typeof (existing as { id?: unknown }).id === "string") {
    return NextResponse.json({ ok: true, id: (existing as { id: string }).id, already: true });
  }

  const insertRow = {
    reporter_id: reporterId,
    target_type: targetType,
    target_id: targetId,
    room_id: body.roomId?.trim() || null,
    product_id: productId,
    reason_code: reasonCode,
    reason_text:
      typeof body.reasonText === "string" ? body.reasonText.trim().slice(0, 2000) || null : null,
    status: "pending",
  };

  const { data, error } = await sbAny
    .from("reports")
    .insert(insertRow as never)
    .select("id")
    .single();

  if (error) {
    const msg = String(error.message ?? "");
    /** RP-1: 동시에 두 번 눌러 DB 유니크 인덱스(`uq_reports_product_reporter_target`)에 걸리면 먼저 접수된 것을 돌려준다 */
    if (oncePerReporter && String((error as { code?: unknown }).code ?? "") === "23505") {
      const { data: dup } = await sbAny
        .from("reports")
        .select("id")
        .eq("reporter_id", reporterId)
        .eq("target_type", targetType)
        .eq("target_id", targetId)
        .limit(1)
        .maybeSingle();
      const dupId = (dup as { id?: unknown } | null)?.id;
      if (typeof dupId === "string") {
        return NextResponse.json({ ok: true, id: dupId, already: true });
      }
    }
    if (/foreign key|violates foreign key|reporter_id/i.test(msg)) {
      console.error("[reports] reporter missing in auth.users (register the user or fix the test login UUID)", msg);
      return reportError("report_failed", 400);
    }
    if (/column|does not exist|schema/i.test(msg)) {
      console.error("[reports] reports table schema mismatch — apply migrations", msg);
      return reportError("report_failed", 500);
    }
    console.error("[reports] insert failed", msg);
    return reportError("report_failed", 500);
  }

  return NextResponse.json({ ok: true, id: (data as { id: string }).id, already: false });
}
