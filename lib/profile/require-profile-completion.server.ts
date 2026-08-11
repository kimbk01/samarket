import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { hasCanonicalDefaultMasterAddress } from "@/lib/addresses/user-address-service";
import { evaluateProfileRequirements } from "@/lib/profile/require-profile-completion";
import {
  ACTION_PROFILE_REQUIREMENTS,
  type ProfileActionType,
} from "@/lib/profile/profile-requirements";

type ProfileRowForGate = {
  id?: string | null;
  dibay_id?: string | null;
  dibay_id_locked?: boolean | null;
  username?: string | null;
  username_confirmed?: boolean | null;
  display_name?: string | null;
  nickname?: string | null;
  phone_verified?: boolean | null;
  phone_verified_at?: string | null;
  phone_verification_method?: string | null;
  role?: string | null;
  provider?: string | null;
  auth_provider?: string | null;
  email?: string | null;
};

export type ProfileFieldsGateResult =
  | { ok: true }
  | { ok: false; response: NextResponse; missingFields: string[] };

export async function requireProfileFieldsForAction(
  sb: SupabaseClient,
  userId: string,
  actionType: ProfileActionType,
  profile?: ProfileRowForGate | null
): Promise<ProfileFieldsGateResult> {
  let row = profile;
  if (!row) {
    const { data, error } = await sb
      .from("profiles")
      .select(
        "id,dibay_id,dibay_id_locked,dibay_id_auto_assigned,dibay_id_changed_once,username,username_confirmed,display_name,nickname,phone_verified,phone_verified_at,phone_verification_method,role,provider,auth_provider,email"
      )
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      return {
        ok: false,
        response: NextResponse.json({ ok: false, error: error.message }, { status: 500 }),
        missingFields: [],
      };
    }
    row = (data as ProfileRowForGate | null) ?? undefined;
  }

  let hasDefaultAddress = false;
  const needsAddress = ACTION_PROFILE_REQUIREMENTS[actionType].includes("default_address");
  if (needsAddress) {
    try {
      hasDefaultAddress = await hasCanonicalDefaultMasterAddress(sb, userId);
    } catch {
      hasDefaultAddress = false;
    }
  }

  const evaluation = evaluateProfileRequirements(
    {
      ...row,
      has_default_address: hasDefaultAddress,
    },
    actionType
  );

  if (evaluation.satisfied) {
    return { ok: true };
  }

  return {
    ok: false,
    missingFields: evaluation.missingFields,
    response: NextResponse.json(
      {
        ok: false,
        error: "profile_incomplete",
        code: "profile_incomplete",
        actionType,
        missingFields: evaluation.missingFields,
      },
      { status: 403 }
    ),
  };
}

/** 메신저 접근·동기화 GET — SSOT (bootstrap / home-sync / rooms list) */
export async function requireMessengerOpenAccess(userId: string): Promise<ProfileFieldsGateResult> {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return {
      ok: false,
      missingFields: [],
      response: NextResponse.json({ ok: false, error: "server_config" }, { status: 503 }),
    };
  }
  return requireProfileFieldsForAction(sb as SupabaseClient, userId, "messenger_open");
}
