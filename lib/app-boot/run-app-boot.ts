"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache, userToProfile } from "@/lib/auth/supabase-profile-cache";
import { dispatchTestAuthChanged } from "@/lib/auth/test-auth-store";
import type { ProfileRow } from "@/lib/profile/types";
import {
  fetchAppBootProfileMinimal,
  peekAppBootProfileFetchCached,
} from "@/lib/app-boot/fetch-app-boot-profile";
import {
  isAppBootReady,
  setAppBootAnonymous,
  setAppBootLoading,
  setAppBootProfile,
} from "@/lib/app-boot/app-boot-store";
import { scheduleAppBootBackgroundHydration } from "@/lib/app-boot/schedule-app-boot-background";
import { primeMeProfileDedupedFromBoot } from "@/lib/profile/fetch-me-profile-deduped";
import { bumpAppWidePerf, recordAppWidePhaseLastMs } from "@/lib/runtime/samarket-runtime-debug";

let bootInFlight: Promise<void> | null = null;

async function runAppBootOnce(): Promise<void> {
  bumpAppWidePerf("app_bootstrap_start");
  const t0 = performance.now();
  setAppBootLoading();

  const sb = getSupabaseClient();
  if (!sb) {
    setAppBootAnonymous();
    recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
    return;
  }

  const {
    data: { user },
    error,
  } = await sb.auth.getUser();
  if (!user || error) {
    setAppBootAnonymous();
    recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
    return;
  }

  const cached = peekAppBootProfileFetchCached();
  const { status, json } = cached ?? (await fetchAppBootProfileMinimal());
  if (status === 401 || status === 403) {
    setAppBootAnonymous();
    recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
    return;
  }

  const data = json as { ok?: boolean; profile?: ProfileRow } | null;
  if (status === 200 && data?.ok && data.profile) {
    primeMeProfileDedupedFromBoot({ status, json });
    setAppBootProfile(data.profile);
    const clientProfile = profileRowToClientProfile(data.profile);
    const base = userToProfile(user);
    setSupabaseProfileCache({
      ...base,
      ...clientProfile,
      avatar_url: clientProfile.avatar_url ?? base?.avatar_url ?? null,
      temperature: clientProfile.temperature ?? base?.temperature ?? 50,
    });
    dispatchTestAuthChanged();
  } else {
    setAppBootAnonymous();
  }

  bumpAppWidePerf("app_bootstrap_success");
  recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
}

export function ensureAppBoot(): Promise<void> {
  if (isAppBootReady()) return Promise.resolve();
  if (!bootInFlight) {
    bootInFlight = runAppBootOnce().finally(() => {
      bootInFlight = null;
      scheduleAppBootBackgroundHydration();
    });
  }
  return bootInFlight;
}
