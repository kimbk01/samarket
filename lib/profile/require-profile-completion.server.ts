import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { hasCanonicalDefaultMasterAddress } from "@/lib/addresses/user-address-service";
import { evaluateProfileRequirements } from "@/lib/profile/require-profile-completion";
import {
  ACTION_PROFILE_REQUIREMENTS,
  SERVER_ROUTE_ADDRESS_CHECK_ACTIONS,
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

/** 프로필 필수 항목 게이트가 읽는 profiles 컬럼(SSOT — 다른 게이트와 합쳐 1회 읽을 때도 이 목록을 쓴다) */
export const PROFILE_FIELDS_GATE_SELECT =
  "id,dibay_id,dibay_id_locked,dibay_id_auto_assigned,dibay_id_changed_once,username,username_confirmed,display_name,nickname,phone_verified,phone_verified_at,phone_verification_method,role,provider,auth_provider,email";

export async function requireProfileFieldsForAction(
  sb: SupabaseClient,
  userId: string,
  actionType: ProfileActionType,
  profile?: ProfileRowForGate | null
): Promise<ProfileFieldsGateResult> {
  const requiredFields = ACTION_PROFILE_REQUIREMENTS[actionType];
  /** 순서 4: 필요한 항목이 없는 기능(`messenger_open`)은 판정이 항상 통과 — 프로필·주소를 읽지 않는다 */
  if (requiredFields.length === 0) return { ok: true };

  let row = profile;
  if (!row) {
    const { data, error } = await sb
      .from("profiles")
      .select(PROFILE_FIELDS_GATE_SELECT)
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

  /**
   * 대표 주소 DB 확인은 2026-11-20 이전부터 주소를 요구하던 행동만 라우트에서 한다(조회 수·통화 API 불변).
   * 그 밖 행동의 가입 조건(대표 주소)은 중앙 쓰기 게이트(`enforce-api-member-mutation-policy` 가입 검사, 추가 조회 0)가 집행한다.
   */
  let hasDefaultAddress = true;
  const needsAddress = requiredFields.includes("default_address") && SERVER_ROUTE_ADDRESS_CHECK_ACTIONS.has(actionType);
  if (needsAddress) {
    hasDefaultAddress = false;
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
