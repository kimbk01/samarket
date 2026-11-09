import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  findDeliveryLaunchReviewerCandidate,
  listDeliveryLaunchReviewers,
} from "@/lib/delivery/launch/delivery-launch-settings.server";
import { internalErrorResponse } from "@/lib/security/internal-error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 매장 확인 허용 계정 추가(POST `{ query: "@아이디|닉네임", note }`)·삭제(DELETE `?userId=`) — 최고관리자.
 * 매장 모집 중에도 이 계정은 배달 화면을 정식 운영 화면으로 본다(주문은 막힘). 설계 v3.2 §3-4-3.
 */
export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  let body: { query?: unknown; note?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const found = await findDeliveryLaunchReviewerCandidate(sb, String(body.query ?? ""));
  if (!found.ok) return NextResponse.json({ ok: false, error: found.error }, { status: found.error === "invalid_query" ? 400 : 404 });
  const note = String(body.note ?? "").trim().slice(0, 80);
  try {
    const { error } = await sb
      .from("delivery_launch_reviewers")
      .upsert({ user_id: found.userId, note, added_by: gate.actor.userId }, { onConflict: "user_id" });
    if (error) {
      if (/delivery_launch_reviewers/.test(error.message) && /(does not exist|schema cache|not find)/i.test(error.message)) {
        return NextResponse.json({ ok: false, error: "migration_not_applied" }, { status: 503 });
      }
      return internalErrorResponse("save_failed", "[/api/admin/delivery-launch/reviewers POST]", error.message, 500);
    }
    await appendAdminRouteAudit(sb, req, {
      actorId: gate.actor.userId,
      targetType: "delivery_launch_reviewer",
      targetId: found.userId,
      action: "delivery_launch.reviewer_add",
      after: { user_id: found.userId, note },
    });
    return NextResponse.json({ ok: true, reviewers: await listDeliveryLaunchReviewers(sb) });
  } catch (e) {
    return internalErrorResponse("save_failed", "[/api/admin/delivery-launch/reviewers POST]", e, 500);
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const userId = new URL(req.url).searchParams.get("userId")?.trim() || "";
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  try {
    const { error } = await sb.from("delivery_launch_reviewers").delete().eq("user_id", userId);
    if (error) return internalErrorResponse("delete_failed", "[/api/admin/delivery-launch/reviewers DELETE]", error.message, 500);
    await appendAdminRouteAudit(sb, req, {
      actorId: gate.actor.userId,
      targetType: "delivery_launch_reviewer",
      targetId: userId,
      action: "delivery_launch.reviewer_remove",
      before: { user_id: userId },
    });
    return NextResponse.json({ ok: true, reviewers: await listDeliveryLaunchReviewers(sb) });
  } catch (e) {
    return internalErrorResponse("delete_failed", "[/api/admin/delivery-launch/reviewers DELETE]", e, 500);
  }
}
