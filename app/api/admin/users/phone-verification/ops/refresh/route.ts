import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadPhoneOtpOpsSnapshot } from "@/lib/auth/phone-otp-ops";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Force Semaphore account probe (respects process cache when rate-limited). */
export async function POST() {
  const gate = await requireAdminPermission("settings");
  if (!gate.ok) return gate.response;
  const sb = gate.sb ?? tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_service_unconfigured" }, { status: 503 });
  }
  const snapshot = await loadPhoneOtpOpsSnapshot(sb, { probeProvider: true, forceProbe: true });
  return NextResponse.json({ ok: true, ops: snapshot });
}
