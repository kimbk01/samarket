import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/reports — 통합 신고 접수 (public.reports)
 * 서비스 롤로 삽입. 신고자 ID는 세션(또는 로컬 테스트 쿠키)에서만 결정.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { enforceUserReportQuota } from "@/lib/security/rate-limit-presets";

const TARGET_TYPES = ["user", "product", "chat_room", "chat_message", "post", "comment"] as const;

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const phone = await requirePhoneVerified(auth.userId);
  if (!phone.ok) return phone.response;

  const reportRl = await enforceUserReportQuota(auth.userId, "unified");
  if (!reportRl.ok) return reportRl.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정이 필요합니다." }, { status: 500 });
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
    return NextResponse.json({ ok: false, error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const reporterId = auth.userId;
  const targetType = body.targetType?.trim();
  const targetId = body.targetId?.trim();
  const reasonCode = body.reasonCode?.trim();
  if (!targetType || !TARGET_TYPES.includes(targetType as (typeof TARGET_TYPES)[number])) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "targetType(user|product|post|comment|chat_room|chat_message)이 필요합니다. (커뮤니티 글은 post)",
      },
      { status: 400 }
    );
  }
  if (!targetId) {
    return NextResponse.json({ ok: false, error: "targetId가 필요합니다." }, { status: 400 });
  }
  if (!reasonCode) {
    return NextResponse.json({ ok: false, error: "reasonCode가 필요합니다." }, { status: 400 });
  }

  const sbAny = sb;

  let productId: string | null = body.productId?.trim() || null;

  if (targetType === "product" || targetType === "post") {
    const { data: post, error: postErr } = await sbAny.from(POSTS_TABLE_READ).select("id").eq("id", targetId).maybeSingle();
    if (postErr) {
      return NextResponse.json({ ok: false, error: postErr.message }, { status: 500 });
    }
    if (!post) {
      return NextResponse.json({ ok: false, error: "해당 게시글을 찾을 수 없습니다." }, { status: 404 });
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
      return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
    }
    const c = cRow as { id?: string; post_id?: string } | null;
    if (!c?.post_id) {
      return NextResponse.json({ ok: false, error: "해당 댓글을 찾을 수 없습니다." }, { status: 404 });
    }
    productId = c.post_id;
  }

  /**
   * P-2 (거래 글 신고만): 같은 신고자·같은 거래 글은 한 번만 접수 — 다시 누르면 기존 접수를 돌려준다.
   * 커뮤니티 글·댓글·사용자·채팅 신고는 기존 동작 그대로(범위 밖).
   */
  const { data: existing } = targetType !== "product" ? { data: null } : await sbAny
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
    if (targetType === "product" && String((error as { code?: unknown }).code ?? "") === "23505") {
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
      return NextResponse.json(
        {
          ok: false,
          error:
            "신고자 UUID가 auth.users에 없습니다. Supabase에 해당 사용자를 등록하거나 테스트 로그인 UUID를 맞춰 주세요.",
        },
        { status: 400 }
      );
    }
    if (/column|does not exist|schema/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "reports 테이블 스키마가 맞지 않습니다. 마이그레이션(daangn_full_trading reports)을 적용해 주세요.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: false, error: msg || "신고 접수에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: (data as { id: string }).id, already: false });
}
