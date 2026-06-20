"use client";

import { dedupeSupabaseAuthGetUser } from "@/lib/auth/dedupe-supabase-get-user-client";
import { recoverFrom401Once } from "@/lib/auth/api-auth-recovery";
import { establishGuestAuthState, isGuestAuthEstablished, clearGuestAuthState } from "@/lib/auth/guest-auth-state";
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
  setAppBootHydrating,
  setAppBootProfile,
} from "@/lib/app-boot/app-boot-store";
import { scheduleAppBootBackgroundHydration } from "@/lib/app-boot/schedule-app-boot-background";
import { markBootMetricsApiDone } from "@/lib/app-boot/dibay-boot-metrics";
import { logStartupApiPlan } from "@/lib/http/startup-api-scheduler";
import { primeMeProfileDedupedFromBoot } from "@/lib/profile/fetch-me-profile-deduped";
import { bumpAppWidePerf, recordAppWidePhaseLastMs } from "@/lib/runtime/samarket-runtime-debug";
import { primeMembershipOnBoot } from "@/hooks/use-client-membership-state";
import type { User } from "@supabase/supabase-js";
import type { MeProfileGetResult } from "@/lib/profile/fetch-me-profile-deduped";

let bootEpoch = 0;
let bootInFlight: Promise<void> | null = null;

/** wipe·invalidate 직후 진행 중 boot 가 stale 프로필을 쓰지 않게 epoch 를 올린다. */
export function invalidateAppBootFlight(): void {
  bootEpoch += 1;
  bootInFlight = null;
}

async function resolveBootProfileMinimal(): Promise<MeProfileGetResult> {
  const cached = peekAppBootProfileFetchCached();
  if (cached) return cached;
  return fetchAppBootProfileMinimal();
}

async function runAppBootOnce(startEpoch: number): Promise<void> {
  const isStale = () => startEpoch !== bootEpoch;
  logStartupApiPlan({
    blocking: [],
    deferred: [
      "/api/me/profile?lite=1",
      "/api/me/profile?mode=full",
      "/api/me/store-owner-hub-badge",
      "/api/me/notification-settings",
      "/api/stores/browse",
      "/api/philife/neighborhood-feed",
    ],
  });
  bumpAppWidePerf("app_bootstrap_start");
  const t0 = performance.now();
  setAppBootHydrating();

  const sb = getSupabaseClient();
  if (!sb) {
    if (isStale()) return;
    setAppBootAnonymous();
    markBootMetricsApiDone();
    recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
    return;
  }

  const [userSettled, profileSettled] = await Promise.allSettled([
    dedupeSupabaseAuthGetUser(sb),
    resolveBootProfileMinimal(),
    primeMembershipOnBoot(),
  ]);

  if (isStale()) return;

  let user: User | null = null;
  let userError: Error | null = null;
  if (userSettled.status === "fulfilled") {
    user = userSettled.value.data.user;
    userError = userSettled.value.error;
  }

  let status: number | undefined;
  let json: unknown;
  if (profileSettled.status === "fulfilled") {
    status = profileSettled.value.status;
    json = profileSettled.value.json;
  } else {
    status = 500;
    json = null;
  }

  if (!user || userError) {
    establishGuestAuthState("app_boot_no_supabase_user");
    setAppBootAnonymous();
    markBootMetricsApiDone();
    recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
    return;
  }

  if (isStale()) return;

  if (status === 401) {
    const recovery = await recoverFrom401Once("app_boot_profile");
    if (recovery.recovered) {
      const retry = await fetchAppBootProfileMinimal();
      status = retry.status;
      json = retry.json;
    } else if (recovery.terminal) {
      setAppBootAnonymous();
      markBootMetricsApiDone();
      recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
      return;
    } else if (recovery.phase === "guest" || isGuestAuthEstablished()) {
      setAppBootAnonymous();
      markBootMetricsApiDone();
      recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
      return;
    } else {
      setAppBootHydrating();
      markBootMetricsApiDone();
      recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
      return;
    }
  }

  if (status === 403) {
    setAppBootAnonymous();
    markBootMetricsApiDone();
    recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
    return;
  }

  const data = json as { ok?: boolean; profile?: ProfileRow } | null;
  if (status === 200 && data?.ok && data.profile) {
    if (isStale()) return;
    clearGuestAuthState();
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
    if (isStale()) return;
    setAppBootAnonymous();
  }

  if (isStale()) return;
  bumpAppWidePerf("app_bootstrap_success");
  markBootMetricsApiDone();
  recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
}

export function ensureAppBoot(): Promise<void> {
  if (isAppBootReady()) return Promise.resolve();
  if (!bootInFlight) {
    const epoch = bootEpoch;
    bootInFlight = runAppBootOnce(epoch).finally(() => {
      bootInFlight = null;
      scheduleAppBootBackgroundHydration();
    });
  }
  return bootInFlight;
}
