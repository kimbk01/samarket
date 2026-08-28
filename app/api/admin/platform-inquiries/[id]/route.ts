import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  notifyStoreOwnerPlatformInquiryReplied,
  notifyStoreOwnerPointAccountReplied,
} from "@/lib/notifications/notify-store-points";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  status?: "open" | "answered" | "closed";
  answer?: string;
};

/** PATCH /api/admin/platform-inquiries/[id] */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  const iid = typeof id === "string" ? id.trim() : "";
  if (!iid) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: before, error: loadErr } = await sb
    .from("platform_admin_inquiries")
    .select("id, inquiry_type, inquiry_kind, store_id, from_user_id, subject, status, answer")
    .eq("id", iid)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ ok: false, error: loadErr.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status) payload.status = body.status;
  if (body.answer !== undefined) {
    const ans = String(body.answer).trim();
    payload.answer = ans || null;
    if (ans) {
      payload.answered_by = admin.userId;
      payload.answered_at = new Date().toISOString();
      payload.status = body.status ?? "answered";
    }
  }

  const { data, error } = await sb
    .from("platform_admin_inquiries")
    .update(payload)
    .eq("id", iid)
    .select("id, status")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const hadAnswerBefore = String(before.answer ?? "").trim().length > 0;
  const newAnswer = body.answer !== undefined ? String(body.answer).trim() : "";
  const shouldNotifyOwner =
    Boolean(before.store_id) &&
    Boolean(before.from_user_id) &&
    newAnswer.length > 0 &&
    !hadAnswerBefore;

  if (shouldNotifyOwner) {
    const isAccountReply =
      before.inquiry_type === "store_point" &&
      String(before.inquiry_kind ?? "general") === "account_request";

    if (isAccountReply) {
      void notifyStoreOwnerPointAccountReplied(sb, {
        storeId: String(before.store_id),
        ownerUserId: String(before.from_user_id),
        inquiryId: iid,
      }).catch((err) => console.error("[PATCH platform-inquiry account notify]", err));
    } else {
      void notifyStoreOwnerPlatformInquiryReplied(sb, {
        storeId: String(before.store_id),
        ownerUserId: String(before.from_user_id),
        inquiryId: iid,
        subject: String(before.subject ?? ""),
        answer: newAnswer,
      }).catch((err) => console.error("[PATCH platform-inquiry notify]", err));
    }
  }

  return NextResponse.json({ ok: true, inquiry: data });
}
