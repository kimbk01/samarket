"use client";

import { dedupeSupabaseAuthGetUser } from "@/lib/auth/dedupe-supabase-get-user-client";
import { recoverFrom401Once } from "@/lib/auth/api-auth-recovery";
import { awaitClientSupabaseSessionReady } from "@/lib/auth/await-client-supabase-session-ready";
import {
  establishGuestAuthState,
  establishRecoverableGuestAuthState,
  isGuestAuthEstablished,
  isRecoverableGuestAuthEstablished,
  clearGuestAuthState,
} from "@/lib/auth/guest-auth-state";
import { logGuestAuthBootMarker } from "@/lib/auth/guest-auth-boot-markers";
import {
  markSessionRecoveringFromClient,
  markSessionTerminalGuestFromClient,
} from "@/lib/auth/dibay-session-manager";
import { runRecoverableGuestRecovery } from "@/lib/auth/guest-auth-recovery";
import { fetchAuthSessionNoStore } from "@/lib/auth/fetch-auth-session-client";
import { getSupabaseClient } from "@/lib/supabase/client";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache, userToProfile } from "@/lib/auth/supabase-profile-cache";
import { dispatchTestAuthChanged } from "@/lib/auth/test-auth-store";
import type { ProfileRow } from "@/lib/profile/types";
import {
  fetchAppBootProfileMinimal,
  invalidateAppBootProfileCache,
  peekAppBootProfileFetchCached,
} from "@/lib/app-boot/fetch-app-boot-profile";
import {
  getAppBootSettleSeq,
  getAppBootSnapshot,
  isAppBootReady,
  setAppBootAnonymous,
  setAppBootHydrating,
  setAppBootProfile,
  setAppBootProfileUnavailable,
  subscribeAppBoot,
} from "@/lib/app-boot/app-boot-store";
import { scheduleAppBootBackgroundHydration } from "@/lib/app-boot/schedule-app-boot-background";
import { markBootMetricsApiDone } from "@/lib/startup/startup-metrics";
import { logStartupApiPlan } from "@/lib/http/startup-api-scheduler";
import { primeMeProfileDedupedFromBoot } from "@/lib/profile/fetch-me-profile-deduped";
import { bumpAppWidePerf, recordAppWidePhaseLastMs } from "@/lib/runtime/samarket-runtime-debug";
import { primeMembershipOnBoot } from "@/hooks/use-client-membership-state";
import type { User } from "@supabase/supabase-js";
import type { MeProfileGetResult } from "@/lib/profile/fetch-me-profile-deduped";

let bootEpoch = 0;
let bootInFlight: Promise<void> | null = null;

/**
 * 로그인 확인 후 lite 실패(`error`) 복구 — 최초 실패 뒤 자동 재시도 최대 3회.
 * 자동 횟수는 확정(ready·anonymous) 또는 epoch 무효화(로그인·로그아웃·계정 전환)에서만 0 으로 돌아간다.
 * online·화면 활성화·명시 요청은 자동 횟수를 쓰지 않고, 진행 중 실행이 있으면 합류한다.
 */
export const APP_BOOT_PROFILE_RECOVERY_DELAYS_MS = [1_500, 3_000, 6_000] as const;
let recoveryAutoAttempts = 0;
let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
let recoveryTriggersBound = false;
let bootStoreSubscribed = false;
let lastArmedSettleSeq = -1;

function clearRecoveryTimer(): void {
  if (recoveryTimer != null) {
    clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }
}

/** wipe·invalidate 직후 진행 중 boot 가 stale 프로필을 쓰지 않게 epoch 를 올린다. */
export function invalidateAppBootFlight(): void {
  bootEpoch += 1;
  bootInFlight = null;
  clearRecoveryTimer();
  recoveryAutoAttempts = 0;
}

/** 확정 회차당 1회 — ensureAppBoot 완료 경로와 상태 구독 경로가 겹쳐도 중복 예약하지 않는다. */
function armBackgroundHydrationOncePerSettle(): void {
  if (!isAppBootReady()) return;
  const seq = getAppBootSettleSeq();
  if (seq === lastArmedSettleSeq) return;
  lastArmedSettleSeq = seq;
  scheduleAppBootBackgroundHydration();
}

function onAppBootStoreChange(): void {
  if (!isAppBootReady()) return;
  clearRecoveryTimer();
  recoveryAutoAttempts = 0;
  /** boot 실행 밖에서 error → ready (약관 동의·프로필 저장 merge 등). 실행 중이면 완료 경로가 예약한다. */
  if (!bootInFlight) armBackgroundHydrationOncePerSettle();
}

function ensureAppBootStoreSubscription(): void {
  if (bootStoreSubscribed || typeof window === "undefined") return;
  bootStoreSubscribed = true;
  subscribeAppBoot(onAppBootStoreChange);
}

function ensureProfileRecoveryTriggers(): void {
  if (recoveryTriggersBound || typeof window === "undefined") return;
  recoveryTriggersBound = true;
  window.addEventListener("online", () => {
    void requestAppBootProfileRecovery();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    void requestAppBootProfileRecovery();
  });
}

function scheduleAutoProfileRecovery(): void {
  if (getAppBootSnapshot().status !== "error") return;
  ensureProfileRecoveryTriggers();
  if (recoveryTimer != null || bootInFlight) return;
  if (recoveryAutoAttempts >= APP_BOOT_PROFILE_RECOVERY_DELAYS_MS.length) return;
  const epoch = bootEpoch;
  recoveryTimer = setTimeout(() => {
    recoveryTimer = null;
    if (epoch !== bootEpoch) return;
    if (getAppBootSnapshot().status !== "error" || bootInFlight) return;
    recoveryAutoAttempts += 1;
    void startAppBootRun();
  }, APP_BOOT_PROFILE_RECOVERY_DELAYS_MS[recoveryAutoAttempts]);
}

/**
 * `error`(로그인 확인 + lite 실패)에서만 다시 실행한다. 다른 상태에서는 아무것도 하지 않는다.
 * 같은 epoch 에서 실행은 하나 — 진행 중이면 그 Promise 에 합류한다.
 */
export function requestAppBootProfileRecovery(): Promise<void> {
  if (bootInFlight) return bootInFlight;
  if (getAppBootSnapshot().status !== "error") return Promise.resolve();
  clearRecoveryTimer();
  return startAppBootRun();
}

function startAppBootRun(): Promise<void> {
  const epoch = bootEpoch;
  let run: Promise<void> | null = null;
  run = runAppBootOnce(epoch)
    .catch(() => {
      /**
       * 인증 확인 중 예외(세션 레지스트리 네트워크 2회 실패 등) — 비회원으로 추정하지 않고
       * `hydrating` 고착 대신 `error` 로 내려 프로필 복구(타이머·online·화면 활성화)가 다시 실행하게 한다.
       */
      if (epoch !== bootEpoch) return;
      if (!isAppBootReady()) setAppBootProfileUnavailable("boot_run_failed");
    })
    .finally(() => {
      if (bootInFlight === run) bootInFlight = null;
      if (epoch !== bootEpoch) return;
      armBackgroundHydrationOncePerSettle();
      scheduleAutoProfileRecovery();
    });
  bootInFlight = run;
  return run;
}

/**
 * 로그인 확인 후 lite 실패 — 5xx·네트워크·마감 초과·비정상 본문·`ok:true, profile:null`.
 * 서버는 미인증을 401 로 먼저 돌려주고 프로필 행이 없으면 생성하므로, 200 + profile 없음은 DB 조회·생성 실패다.
 * 401·403 은 기존 판정 유지.
 */
function isBootProfileFetchFailure(rejected: boolean, status: number | undefined, json: unknown): boolean {
  if (rejected) return true;
  if (status === 401 || status === 403) return false;
  if (status === 200) {
    const data = json as { ok?: unknown; profile?: unknown } | null;
    return data?.ok !== true || data.profile == null;
  }
  return true;
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
  logGuestAuthBootMarker("app_boot_recovering_no_supabase_user", { reason });
  logGuestAuthBootMarker("app_boot_guest_deferred", { reason });
  establishRecoverableGuestAuthState("app_boot_auth_pending_recoverable");
  markSessionRecoveringFromClient(`app_boot:${reason}`);
  setAppBootHydrating();
  if (profileStatus !== undefined && applyBootProfileEvidence(profileStatus, profileJson, user ?? null)) {
    /* profile evidence already emitted ready — recovery may still prime Supabase */
  }
  const recovered = await runRecoverableGuestRecovery(`app_boot:${reason}`).catch(() => false);
  if (startEpoch !== bootEpoch) return true;
  /**
   * CUT-A — recovery must not leave boot in permanent `hydrating`.
   * Profile evidence already ready → keep. Else terminal anonymous so delivery
   * feed gate can leave pending blank (address CTA + root feed allowed).
   */
  if (!isAppBootReady()) {
    if (recovered) {
      /** 세션 복구 전 401 lite 캐시(4초)를 재사용하지 않는다 — 복구 성공 시에만 */
      invalidateAppBootProfileCache();
      const retry = await resolveBootProfileMinimal().then(
        (r) => r,
        () => null,
      );
      if (startEpoch !== bootEpoch) return true;
      if (!retry) {
        /** 세션 복구 성공 + lite 네트워크·마감 실패 — 401 증거가 아니므로 비회원 확정 금지 */
        if (!isAppBootReady()) setAppBootProfileUnavailable("profile_fetch_failed_after_session_recovery");
        markBootMetricsApiDone();
        recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
        return true;
      }
      if (applyBootProfileEvidence(retry.status, retry.json, null)) {
        markBootMetricsApiDone();
        recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
        return true;
      }
    }
    establishGuestAuthState("app_boot_terminal_guest_after_recovery");
    markSessionTerminalGuestFromClient("app_boot_recovery_unresolved");
    setAppBootAnonymous();
  }
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

  establishGuestAuthState("app_boot_terminal_guest_confirmed");
  logGuestAuthBootMarker("app_boot_terminal_guest_confirmed", { reason: "unauthenticated_confirmed" });
  markSessionTerminalGuestFromClient("app_boot_unauthenticated_confirmed");
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
      /** P3-b1 — Boot Initial Generation Authority (COMPLETE owner; Bell joins). */
      "/api/me/notifications/badge-count",
      "/api/me/store-owner-hub-badge",
      "/api/me/notification-settings",
      "/api/stores/browse",
      "/api/philife/neighborhood-feed",
    ],
  });
  bumpAppWidePerf("app_bootstrap_start");
  const t0 = performance.now();
  /** 복구 실행 중에는 `error` 유지 — hydrating 으로 내리면 매장 피드 게이트가 매 재시도마다 빈 화면으로 돌아간다. */
  if (getAppBootSnapshot().status !== "error") setAppBootHydrating();

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
  let profileRejected = false;
  if (profileSettled.status === "fulfilled") {
    status = profileSettled.value.status;
    json = profileSettled.value.json;
  } else {
    status = 500;
    json = null;
    profileRejected = true;
  }

  if (!user || userError) {
    const handled = await resolveBootWhenGetUserEmpty(sb, startEpoch, t0, status, json, userError);
    if (handled) return;
    user = (await dedupeSupabaseAuthGetUser(sb)).data.user;
    if (!user?.id) {
      /** CUT-A — never leave `hydrating` without ready|anonymous */
      if (startEpoch !== bootEpoch) return;
      establishGuestAuthState("app_boot_terminal_guest_confirmed");
      markSessionTerminalGuestFromClient("app_boot_get_user_empty_after_retry");
      setAppBootAnonymous();
      markBootMetricsApiDone();
      recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
      return;
    }
  }

  if (isStale()) return;

  if (status === 401) {
    const recovery = await recoverFrom401Once("app_boot_profile");
    if (recovery.recovered) {
      /** 세션 복구 전 401 lite 캐시(4초)를 재사용하지 않는다 — 복구 성공 시에만 */
      invalidateAppBootProfileCache();
      const retry = await fetchAppBootProfileMinimal().then(
        (r) => r,
        () => null,
      );
      if (retry) {
        status = retry.status;
        json = retry.json;
      } else {
        status = undefined;
        json = null;
        profileRejected = true;
      }
    } else if (recovery.terminal) {
      setAppBootAnonymous();
      markBootMetricsApiDone();
      recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
      return;
    } else if (recovery.phase === "terminal_guest" || (isGuestAuthEstablished() && !isRecoverableGuestAuthEstablished())) {
      setAppBootAnonymous();
      markSessionTerminalGuestFromClient("app_boot_profile_terminal");
      markBootMetricsApiDone();
      recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
      return;
    } else if (recovery.phase === "loading") {
      /** 세션 확인이 일시 장애(네트워크·마감)로 끝남 — 401 비회원 증거가 아니므로 기존 error 복구(1.5·3·6초)로 */
      if (startEpoch !== bootEpoch) return;
      if (!isAppBootReady()) setAppBootProfileUnavailable("profile_401_session_check_transient");
      markBootMetricsApiDone();
      recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
      return;
    } else {
      /**
       * CUT-A — profile 401 + non-terminal recovery must not park forever in hydrating.
       * Await one recovery; if still not ready, terminal anonymous (cookie/API may still
       * serve public home-feed; address CTA remains for location).
       */
      setAppBootHydrating();
      const recovered = await runRecoverableGuestRecovery("app_boot_profile_401").catch(() => false);
      if (startEpoch !== bootEpoch) return;
      if (recovered) {
        /** 세션 복구 전 401 lite 캐시(4초)를 재사용하지 않는다 — 복구 성공 시에만 */
        invalidateAppBootProfileCache();
        const retry = await fetchAppBootProfileMinimal().then(
          (r) => r,
          () => null,
        );
        if (startEpoch !== bootEpoch) return;
        if (!retry) {
          /** 세션 복구 성공 + lite 네트워크·마감 실패 — 401 증거가 아니므로 비회원 확정 금지 */
          if (!isAppBootReady()) setAppBootProfileUnavailable("profile_fetch_failed_after_401_recovery");
          markBootMetricsApiDone();
          recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
          return;
        }
        status = retry.status;
        json = retry.json;
        if (applyBootProfileEvidence(status, json, user)) {
          markBootMetricsApiDone();
          recordAppWidePhaseLastMs("app_boot_layer_ms", Math.round(performance.now() - t0));
          return;
        }
      }
      if (!isAppBootReady()) {
        establishGuestAuthState("app_boot_terminal_guest_profile_401");
        markSessionTerminalGuestFromClient("app_boot_profile_401_unresolved");
        setAppBootAnonymous();
      }
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
  } else if (isBootProfileFetchFailure(profileRejected, status, json)) {
    if (isStale()) return;
    /** getUser 로 로그인 확인된 사용자 — 프로필 조회 실패를 비회원으로 확정하지 않는다. */
    if (!isAppBootReady()) setAppBootProfileUnavailable("profile_fetch_failed");
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

/**
 * `error` 에서는 새 실행을 시작하지 않고 즉시 반환한다 (재시도는 프로필 복구만 담당).
 * 반환은 시작 완료·비회원 확정이 아니다 — 호출처는 `isAppBootReady()`·boot profile 로 판정한다.
 */
export function ensureAppBoot(): Promise<void> {
  ensureAppBootStoreSubscription();
  if (isAppBootReady()) return Promise.resolve();
  if (bootInFlight) return bootInFlight;
  if (getAppBootSnapshot().status === "error") return Promise.resolve();
  return startAppBootRun();
}
