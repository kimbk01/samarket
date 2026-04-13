/**
 * POST /api/reports — 통합 신고 접수 (public.reports)
 * 서비스 롤로 삽입. 신고자 ID는 세션(또는 로컬 테스트 쿠키)에서만 결정.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { enforceUserReportQuota } from "@/lib/security/rate-limit-presets";

const TARGET_TYPES = ["user", "product", "chat_room", "chat_message", "post", "comment"] as const;

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;

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
    const { data: post, error: postErr } = await sbAny.from("posts").select("id").eq("id", targetId).maybeSingle();
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

  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}
