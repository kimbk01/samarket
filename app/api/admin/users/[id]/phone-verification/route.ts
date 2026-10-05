import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { syncPhoneVerifiedServerCache } from "@/lib/auth/phone-otp-server-sync";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  buildPhoneVerifiedMemberPatch,
  buildPhoneVerificationResetPatch,
  buildPhoneVerificationStatusPatch,
  loadProfilePhoneRowSlice,
  type AdminPhoneVerificationStatus,
} from "@/lib/profile/admin-phone-verification-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: readonly AdminPhoneVerificationStatus[] = [
  "unverified",
  "pending",
  "verified",
  "rejected",
];

function isStatus(v: string): v is AdminPhoneVerificationStatus {
  return (STATUSES as readonly string[]).includes(v);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdminPermission("users_edit_membership");
  if (!gate.ok) return gate.response;
  const sb = gate.sb ?? tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_service_unconfigured" }, { status: 503 });
  }

  const { id } = await context.params;
  const userId = id?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: { action?: string; status?: string; method?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // Admin path must never accept OTP method spoofing.
  if (body.method != null && String(body.method).trim() !== "") {
    return NextResponse.json({ ok: false, error: "method_not_allowed" }, { status: 400 });
  }

  const action = String(body.action ?? "approve").trim();
  const statusRaw = String(body.status ?? "").trim().toLowerCase();

  let patch: Record<string, unknown>;
  let auditAction: string;
  let auditAfter: Record<string, unknown>;

  if (action === "set_status") {
    if (!isStatus(statusRaw)) {
      return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
    }
    const phoneRow =
      statusRaw === "unverified" ? null : await loadProfilePhoneRowSlice(sb, userId);
    if (statusRaw === "verified" || statusRaw === "rejected") {
      const hasPhone = Boolean(
        phoneRow &&
          (String((phoneRow as { phone?: string }).phone ?? "").trim() ||
            String((phoneRow as { phone_number?: string }).phone_number ?? "").trim()),
      );
      if (!hasPhone) {
        return NextResponse.json({ ok: false, error: "phone_required" }, { status: 400 });
      }
    }
    patch = buildPhoneVerificationStatusPatch({ status: statusRaw, phoneRow });
    auditAction = "admin_member_phone_verify_set_status";
    auditAfter = { action: "set_status", status: statusRaw, method: "admin_manual" };
  } else if (action === "reset") {
    patch = buildPhoneVerificationResetPatch();
    auditAction = "admin_member_phone_verify_reset";
    auditAfter = { action: "reset" };
  } else if (action === "approve") {
    const phoneRow = await loadProfilePhoneRowSlice(sb, userId);
    patch = buildPhoneVerifiedMemberPatch({ method: "admin_manual", phoneRow });
    auditAction = "admin_member_phone_verify_approve";
    auditAfter = { action: "approve", method: "admin_manual" };
  } else {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const { error } = await sb.from("profiles").update(patch).eq("id", userId);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message || "update_failed" }, { status: 500 });
  }
  await syncPhoneVerifiedServerCache(userId);

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: gate.actor.userId,
    target_type: "member",
    target_id: userId,
    action: auditAction,
    after_json: auditAfter,
  });

  return NextResponse.json({
    ok: true,
    action: auditAfter.action,
    status: auditAfter.status ?? null,
  });
}
