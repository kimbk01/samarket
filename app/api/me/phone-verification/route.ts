import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  PHONE_VERIFICATION_REQUIRED_MESSAGE,
  loadMemberAccessState,
} from "@/lib/auth/member-access";
import { normalizePhMobileDb, PH_LOCAL_MOBILE_RULE_MESSAGE_KO } from "@/lib/utils/ph-mobile";
import { enforcePhoneVerificationPatchQuota } from "@/lib/security/rate-limit-presets";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_service_unconfigured" }, { status: 503 });
  }
  const state = await loadMemberAccessState(sb, auth.userId);
  return NextResponse.json({
    ok: true,
    verification: {
      phone: state.phone,
      phone_verified: state.phoneVerified,
      phone_verification_status: state.phoneVerificationStatus,
      nickname: state.nickname,
      help_text: PHONE_VERIFICATION_REQUIRED_MESSAGE,
    },
  });
}

type PatchBody = {
  phone?: string;
  nickname?: string;
};

export async function PATCH(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const phoneRl = await enforcePhoneVerificationPatchQuota(auth.userId);
  if (!phoneRl.ok) return phoneRl.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_service_unconfigured" }, { status: 503 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const normalizedPhone = normalizePhMobileDb(String(body.phone ?? "").trim());
  const nickname = String(body.nickname ?? "").trim();
  if (!normalizedPhone) {
    return NextResponse.json({ ok: false, error: PH_LOCAL_MOBILE_RULE_MESSAGE_KO }, { status: 400 });
  }
  if (!nickname) {
    return NextResponse.json({ ok: false, error: "닉네임을 입력해 주세요." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    phone: normalizedPhone,
    nickname,
    phone_verified: false,
    phone_verification_status: "pending",
    phone_verification_requested_at: new Date().toISOString(),
    preferred_country: "PH",
  };
  const { error } = await sb.from("profiles").upsert({
    id: auth.userId,
    ...patch,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message || "save_failed" }, { status: 500 });
  }

  await sb
    .from("test_users")
    .update({
      display_name: nickname,
      contact_phone: normalizedPhone,
    })
    .eq("id", auth.userId);

  return NextResponse.json({
    ok: true,
    verification: {
      phone: normalizedPhone,
      phone_verified: false,
      phone_verification_status: "pending",
      nickname,
    },
  });
}
