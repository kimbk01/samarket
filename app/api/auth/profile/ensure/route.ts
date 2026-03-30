import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { ensureAuthProfileRow } from "@/lib/auth/member-access";

export const dynamic = "force-dynamic";

export async function POST() {
  const routeSb = await createSupabaseRouteHandlerClient();
  if (!routeSb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const {
    data: { user },
    error,
  } = await routeSb.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const serviceSb = tryCreateSupabaseServiceClient();
  if (!serviceSb) {
    return NextResponse.json({ ok: false, error: "supabase_service_unconfigured" }, { status: 503 });
  }

  try {
    const state = await ensureAuthProfileRow(serviceSb, user);
    return NextResponse.json({
      ok: true,
      profile: {
        id: state.userId,
        email: state.email ?? "",
        nickname: state.nickname,
        avatar_url: state.avatarUrl,
        username: state.username,
        role: state.role,
        member_type: state.memberType,
        phone: state.phone,
        phone_verified: state.phoneVerified,
        phone_verification_status: state.phoneVerificationStatus,
        temperature: 50,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || "profile_ensure_failed" },
      { status: 500 }
    );
  }
}
