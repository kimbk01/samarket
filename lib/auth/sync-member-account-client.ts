"use client";

import { invalidateMandatoryAddressGateClientCache } from "@/lib/addresses/mandatory-address-gate-client";
import { invalidateAddressDefaultsSnapshotCache } from "@/lib/addresses/fetch-address-defaults-client";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import type { ProfileRow } from "@/lib/profile/types";

/** OTP / @id / address mutation 직후 — gate reader 가 stale cache 를 보지 않게 한다. */
export async function refreshClientMemberAccountAfterMutation(): Promise<ProfileRow | null> {
  invalidateMeProfileDedupedCache();
  invalidateMandatoryAddressGateClientCache();
  invalidateAddressDefaultsSnapshotCache();
  const fresh = await getMyProfile();
  if (fresh) {
    setSupabaseProfileCache(profileRowToClientProfile(fresh));
  }
  return fresh;
}
