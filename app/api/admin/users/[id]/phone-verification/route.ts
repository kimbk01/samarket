import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
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
  const patch =
    action === "reset"
      ? {
          phone_verified: false,
          phone_verification_status: "unverified",
          phone_verified_at: null,
          member_status: "pending",
          verified_member_at: null,
        }
      : {
          phone_verified: true,
          phone_verification_status: "verified",
          phone_verified_at: new Date().toISOString(),
          phone_verification_method: "admin_manual",
          member_status: "active",
          verified_member_at: new Date().toISOString(),
        };

  const { error } = await sb.from("profiles").update(patch).eq("id", userId);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message || "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, action });
}
