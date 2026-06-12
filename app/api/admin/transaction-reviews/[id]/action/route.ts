import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
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
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const supabaseEnv = requireSupabaseEnv({ requireAnonKey: true });
  if (!supabaseEnv.ok) {
    return NextResponse.json({ ok: false, error: supabaseEnv.error }, { status: 500 });
  }

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

  const sb = supabaseEnv.serviceKey
    ? createClient(supabaseEnv.url, supabaseEnv.serviceKey, { auth: { persistSession: false } })
    : createClient(supabaseEnv.url, supabaseEnv.anonKey);
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient;

  const { data: row, error: fetchErr } = await sbAny
    .from("transaction_reviews")
    .select("id, reviewee_id, is_hidden_by_admin")
    .eq("id", reviewId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const revieweeId = String((row as { reviewee_id?: string }).reviewee_id ?? "");

  if (action === "hide_review") {
    const { error } = await sbAny
      .from("transaction_reviews")
      .update({ is_hidden_by_admin: true })
      .eq("id", reviewId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  } else if (action === "restore_review") {
    const { error } = await sbAny
      .from("transaction_reviews")
      .update({ is_hidden_by_admin: false })
      .eq("id", reviewId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await sbAny.from("moderation_actions").insert({
    target_type: "transaction_review",
    target_id: reviewId,
    action_type: action,
    action_note: note || undefined,
    actor_admin_id: admin.userId,
  });

  void appendAuditLog(sbAny, {
    actor_type: "admin",
    actor_id: admin.userId,
    target_type: "transaction_review",
    target_id: reviewId,
    action,
    after_json: { note, revieweeId },
  });

  return NextResponse.json({ ok: true });
}
