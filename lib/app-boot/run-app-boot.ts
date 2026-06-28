"use client";

import { dedupeSupabaseAuthGetUser } from "@/lib/auth/dedupe-supabase-get-user-client";
import { recoverFrom401Once } from "@/lib/auth/api-auth-recovery";
import { awaitClientSupabaseSessionReady } from "@/lib/auth/await-client-supabase-session-ready";
import {
  establishGuestAuthState,
  establishRecoverableGuestAuthState,
  isGuestAuthEstablished,
  clearGuestAuthState,
} from "@/lib/auth/guest-auth-state";
import { logGuestAuthBootMarker } from "@/lib/auth/guest-auth-boot-markers";
import { runRecoverableGuestRecovery } from "@/lib/auth/guest-auth-recovery";
import { fetchAuthSessionNoStore } from "@/lib/auth/fetch-auth-session-client";
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

function bootProfileIsAuthenticated(status: number | undefined, json: unknown): json is { ok: true; profile: ProfileRow } {
  const data = json as { ok?: boolean; profile?: ProfileRow } | null;
  return status === 200 && !!data?.ok && !!data.profile;
}

function applyBootProfileEvidence(
  status: number | undefined,
  json: unknown,
  user: User | null,
): boolean {
  if (!bootProfileIsAuthenticated(status, json)) return false;
  const data = json as { ok: true; profile: ProfileRow };
  primeMeProfileDedupedFromBoot({ status: status as number, json });
  setAppBootProfile(data.profile);
  const clientProfile = profileRowToClientProfile(data.profile);
  const base = user ? userToProfile(user) : clientProfile;
  setSupabaseProfileCache({
    ...base,
    ...clientProfile,
    avatar_url: clientProfile.avatar_url ?? base?.avatar_url ?? null,
    temperature: clientProfile.temperature ?? base?.temperature ?? 50,
  });
  dispatchTestAuthChanged();
  return true;
}

async function deferBootGuestForRecovery(
  reason: string,
  startEpoch: number,
  t0: number,
  profileStatus?: number,
  profileJson?: unknown,
  user?: User | null,
): Promise<boolean> {
  if (startEpoch !== bootEpoch) return true;
  logGuestAuthBootMarker("app_boot_guest_deferred", { reason });
  establishRecoverableGuestAuthState("app_boot_auth_pending_recoverable");
  setAppBootHydrating();
  if (profileStatus !== undefined && applyBootProfileEvidence(profileStatus, profileJson, user ?? null)) {
    /* profile cache primed while Supabase user catches up */
  }
  void runRecoverableGuestRecovery(`app_boot:${reason}`);
  markBootMetricsApiDone();
  recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
  return true;
}

async function resolveBootWhenGetUserEmpty(
  sb: NonNullable<ReturnType<typeof getSupabaseClient>>,
  startEpoch: number,
  t0: number,
  profileStatus: number | undefined,
  profileJson: unknown,
  userError: Error | null,
): Promise<boolean> {
  logGuestAuthBootMarker("app_boot_get_user_empty", {
    hasError: !!userError,
    profileStatus: profileStatus ?? null,
  });

  if (bootProfileIsAuthenticated(profileStatus, profileJson)) {
    logGuestAuthBootMarker("app_boot_profile_authenticated_while_get_user_empty", {
      profileStatus,
    });
    return deferBootGuestForRecovery(
      "profile_authenticated_get_user_empty",
      startEpoch,
      t0,
      profileStatus,
      profileJson,
      null,
    );
  }

  const sessionRes = await fetchAuthSessionNoStore("app_boot_session_registry");
  if (sessionRes.ok) {
    return deferBootGuestForRecovery("session_registry_authenticated", startEpoch, t0, profileStatus, profileJson);
  }

  await awaitClientSupabaseSessionReady(1_500);
  const retried = await dedupeSupabaseAuthGetUser(sb);
  const retriedUser = retried.data.user;
  if (retriedUser?.id) {
    clearGuestAuthState();
    return false;
  }

  if (bootProfileIsAuthenticated(profileStatus, profileJson)) {
    return deferBootGuestForRecovery("profile_authenticated_after_retry", startEpoch, t0, profileStatus, profileJson);
  }

  if (sessionRes.status >= 500 || sessionRes.status === 429) {
    return deferBootGuestForRecovery("session_registry_transient", startEpoch, t0, profileStatus, profileJson);
  }

  establishGuestAuthState("app_boot_unauthenticated_confirmed");
  setAppBootAnonymous();
  markBootMetricsApiDone();
  recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
  return true;
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
    const handled = await resolveBootWhenGetUserEmpty(sb, startEpoch, t0, status, json, userError);
    if (handled) return;
    user = (await dedupeSupabaseAuthGetUser(sb)).data.user;
    if (!user?.id) return;
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

  /**
   * Membership resolve 는 화면 보호막(AuthSessionBoundary)에서 별도로 보장된다.
   * cold boot 첫 페인트를 막지 않도록 boot critical path 밖에서 비동기 예열만 수행한다.
   */
  void primeMembershipOnBoot().catch(() => {
    /* non-blocking */
  });
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
