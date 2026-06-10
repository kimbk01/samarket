"use client";

import type { Profile } from "@/lib/types/profile";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { fetchAuthSessionNoStore } from "@/lib/auth/fetch-auth-session-client";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";

const MEMBERSHIP_RESOLVE_FLIGHT = "client:resolve-client-membership";

/**
 * 클라이언트 회원 여부 단일 판정.
 * 1) 프로필 캐시  2) GET /api/auth/session  3) GET /api/me/profile
 * 캐시 비어 있어도 세션이 있으면 비회원으로 오판하지 않는다.
 */
export async function resolveClientProfileFromSession(
  source = "resolveClientProfileFromSession",
): Promise<Profile | null> {
  const cached = getCurrentUser();
  if (cached?.id) return cached;

  const sessionRes = await fetchAuthSessionNoStore(source);
  if (!sessionRes.ok) return null;

  const row = await getMyProfile().catch(() => null);
  if (!row?.id) return null;

  const profile = profileRowToClientProfile(row);
  setSupabaseProfileCache(profile);
  return profile;
}

export type ClientMembershipResolution =
  | { status: "member"; profile: Profile }
  | { status: "guest" };

export function invalidateClientMembershipResolveFlight(): void {
  forgetSingleFlight(MEMBERSHIP_RESOLVE_FLIGHT);
}

export async function resolveClientMembership(
  source = "resolveClientMembership",
): Promise<ClientMembershipResolution> {
  const cached = getCurrentUser();
  if (cached?.id) return { status: "member", profile: cached };

  return runSingleFlight(MEMBERSHIP_RESOLVE_FLIGHT, async () => {
    const profile = await resolveClientProfileFromSession(source);
    if (profile?.id) return { status: "member", profile };
    return { status: "guest" };
  });
}
