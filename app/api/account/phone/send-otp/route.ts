import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { sendPhoneOtpForUser } from "@/lib/auth/phone-otp-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, message: "supabase_service_unconfigured" }, { status: 503 });
  }

  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "invalid_json" }, { status: 400 });
  }

  const result = await sendPhoneOtpForUser(sb, auth.userId, String(body.phone ?? ""));
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true, phone: result.data.phone });
}
