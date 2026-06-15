import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { syncPhoneVerifiedServerCache } from "@/lib/auth/phone-otp-server-sync";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  buildPhoneVerifiedMemberPatch,
  buildPhoneVerificationResetPatch,
  loadProfilePhoneRowSlice,
} from "@/lib/profile/admin-phone-verification-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
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

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = String(body.action ?? "approve").trim();
  const phoneRow = action !== "reset" ? await loadProfilePhoneRowSlice(sb, userId) : null;
  const patch =
    action === "reset"
      ? buildPhoneVerificationResetPatch()
      : buildPhoneVerifiedMemberPatch({ method: "admin_manual", phoneRow });

  const { error } = await sb.from("profiles").update(patch).eq("id", userId);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message || "update_failed" }, { status: 500 });
  }
  await syncPhoneVerifiedServerCache(userId);

  return NextResponse.json({ ok: true, action });
}
