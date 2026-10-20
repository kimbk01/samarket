import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import type { ReviewModerationActionType } from "@/lib/types/admin-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED: ReviewModerationActionType[] = [
  "hide_review",
  "restore_review",
  "review_only",
  "recalculate_trust",
];

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;

  const { id: reviewId } = await ctx.params;
  if (!reviewId?.trim()) {
    return NextResponse.json({ ok: false, error: "review_id_required" }, { status: 400 });
  }

  let body: { action?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = String(body.action ?? "").trim() as ReviewModerationActionType;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  if (!ALLOWED.includes(action)) {
    return NextResponse.json({ ok: false, error: "unsupported_action" }, { status: 400 });
  }
  // 숨김·복원은 사유 필수 (설계 v2 §D-5)
  if ((action === "hide_review" || action === "restore_review") && note.length < 2) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }

  const sbAny = admin.sb;

  const { data: row, error: fetchErr } = await sbAny
    .from("transaction_reviews")
    // Production has no is_hidden_by_admin — select identity only.
    .select("id, reviewee_id")
    .eq("id", reviewId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const revieweeId = String((row as { reviewee_id?: string }).reviewee_id ?? "");

  if (action === "hide_review" || action === "restore_review") {
    // Production SSOT: column may be absent — degrade to moderation_actions + audit only.
    const patch =
      action === "hide_review"
        ? { is_hidden_by_admin: true }
        : { is_hidden_by_admin: false };
    const { error } = await sbAny.from("transaction_reviews").update(patch).eq("id", reviewId);
    if (error && !/is_hidden_by_admin|column|42703/i.test(String(error.message))) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  await sbAny.from("moderation_actions").insert({
    target_type: "transaction_review",
    target_id: reviewId,
    action_type: action,
    action_note: note || undefined,
    actor_admin_id: admin.userId,
  });

  const audit = await appendCommunityAdminAudit(sbAny, req, {
    actorId: admin.userId,
    targetType: "transaction_review",
    targetId: reviewId,
    action: `transaction_review.${action}`,
    reason: note || null,
    after: { revieweeId },
  });

  return NextResponse.json({ ok: true, ...(audit.ok ? {} : { auditWarning: true }) });
}
