"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getAppBootSnapshot,
  isAppBootReady,
  peekAppBootProfile,
  subscribeAppBoot,
} from "@/lib/app-boot/app-boot-store";
import { APP_BOOT_READY_EVENT } from "@/lib/app-boot/app-boot-types";
import { ensureAppBoot } from "@/lib/app-boot/run-app-boot";
import { deriveDibaySignupStatus } from "@/lib/auth/dibay-signup-status";
import { isClientSignupGateExemptPath } from "@/lib/auth/client-signup-gate";
import { fetchSignupStatusDeduped } from "@/lib/auth/fetch-signup-status-client";
import {
  getClientRequiredConsentVersions,
  subscribeClientRequiredConsentVersions,
} from "@/lib/legal/client-required-consent";
import {
  isSignupCompleteResolvedThisSession,
  markSignupCompleteResolvedSession,
  markSignupConsentResolvedSession,
  clearSignupCompleteResolvedSession,
  resetSignupGateSessionFlags,
} from "@/lib/auth/signup-gate-session";
import { classifySignupStatusResponse, signupGateRetryDelayMs } from "@/lib/auth/signup-gate-decision";
import { guardedRouterReplace, logNetworkLoopGuardReplace } from "@/lib/dev/network-loop-guard";
import {
  isRegistrationGateExemptPath,
  markRegistrationGatePassthrough,
  resolveRegistrationGateTarget,
} from "@/lib/auth/registration-gate";
import {
  invalidateRegistrationPending,
  peekRegistrationPendingKnowledge,
  setRegistrationPendingFromServer,
  subscribeRegistrationPending,
} from "@/lib/auth/registration-pending-state.client";
import {
  fetchMandatoryAddressGateDeduped,
  invalidateMandatoryAddressGateClientCache,
} from "@/lib/addresses/mandatory-address-gate-client";
import { isStoreOwnerAdminPathname } from "@/lib/business/owner-hub-path";
import {
  OWNER_HUB_SECONDARY_AFTER_MS,
  runNowOrScheduleOnStoreOwnerAdmin,
} from "@/lib/business/owner-hub-secondary-fetch-queue";

/** Resume refresh of required consent versions — at most once per minute. */
const CONSENT_VERSION_REFRESH_MIN_MS = 60_000;

type RegistrationCheck = "complete" | "redirected" | "exempt" | "retry";

/**
 * 마지막으로 가입 단계 화면으로 보낸 기록 — **모듈 상태**(단계 화면은 `(main)` 밖이라 이 관문이 다시 마운트되며 ref 가 사라짐).
 * 단계 화면이 서버 판정으로 곧바로 원래 화면에 되돌려 보내면(다른 기기에서 완료 등) 사본이 옛 값 → 왕복이 생긴다(전체 감사 A6).
 * 같은 화면으로 20초 안에 되돌아오면 사본·요청 캐시를 버리고 서버에 다시 묻는다. 두 번 연속이면 그 화면은 이번에 보내지 않는다.
 */
const REGISTRATION_BOUNCE_WINDOW_MS = 20_000;
let lastRegistrationRedirect: { from: string; at: number; bounces: number } | null = null;

function noteRegistrationRedirect(from: string): void {
  const now = Date.now();
  const prev = lastRegistrationRedirect;
  const sameBounce = prev && prev.from === from && now - prev.at < REGISTRATION_BOUNCE_WINDOW_MS;
  lastRegistrationRedirect = { from, at: now, bounces: sameBounce ? prev.bounces + 1 : 0 };
}

function isRegistrationBounce(from: string): { bounce: boolean; repeated: boolean } {
  const prev = lastRegistrationRedirect;
  if (!prev || prev.from !== from || Date.now() - prev.at >= REGISTRATION_BOUNCE_WINDOW_MS) {
    return { bounce: false, repeated: false };
  }
  return { bounce: true, repeated: prev.bounces >= 1 };
}

export function resetRegistrationBounceForTests(): void {
  lastRegistrationRedirect = null;
}

async function readRegistrationFromServer(opts: { bypassCache: boolean }): Promise<"ok" | "guest" | "retry"> {
  try {
    const res = await fetchMandatoryAddressGateDeduped({
      component: "DibaySignupGate",
      reason: opts.bypassCache ? "registration_bounce" : "registration",
      bypassCache: opts.bypassCache,
    });
    if (!res.ok) return "retry";
    const j = (await res.clone().json()) as { ok?: boolean; authenticated?: boolean; registrationNextStep?: string | null };
    if (j.ok !== true) return "retry";
    /** 비로그인(세션 없음) — 가입 관문 대상 아님 */
    if (j.authenticated !== true) return "guest";
    setRegistrationPendingFromServer(j.registrationNextStep ?? null);
    return "ok";
  } catch {
    return "retry";
  }
}

/**
 * 가입 관문 1곳 (설계 `docs/audit/registration-ssot-redesign-2026-11-24.md` S1):
 * ① 동의 미완 → 동의 화면(기존) ② 동의 완료 + 전화·주소 미완 → 빠진 단계 화면(`registration-gate`).
 * 건너뛰기·세션당 1회 없음 — 예외 경로가 아니면 화면 이동마다 같은 판정. 통화 화면은 덮지 않는다.
 * 빠진 단계 값은 서버 판정(`registration-pending-state`)만 쓴다 — 모르면 `/api/me/mandatory-address-gate`
 * (`MandatoryAddressGate` 와 같은 single-flight·15초 캐시라 요청이 늘지 않는다).
 */
export function DibaySignupGate() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const routerRef = useRef(router);
  const pathnameRef = useRef(pathname);
  const checkInFlightRef = useRef<Promise<void> | null>(null);
  const redirectInFlightTargetRef = useRef<string | null>(null);
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkSignupGateRef = useRef<() => void>(() => {});

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current) return;
    const delay = signupGateRetryDelayMs(retryAttemptRef.current);
    if (delay == null) return;
    retryAttemptRef.current += 1;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      checkSignupGateRef.current();
    }, delay);
  }, []);

  /** 동의 완료 뒤 — 전화·주소 단계 */
  const checkRegistration = useCallback(async (): Promise<RegistrationCheck> => {
    const here =
      typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : pathnameRef.current;
    if (isRegistrationGateExemptPath(pathnameRef.current)) return "exempt";
    let known = peekRegistrationPendingKnowledge();
    if (known === "unknown") {
      /**
       * 매장 사장님 운영 화면 — 첫 화면을 먼저 그리도록 `MandatoryAddressGate` 와 같은 지연(5.2초) 직렬 큐로 읽는다.
       * 같은 요청은 15초 캐시·단일 비행(`fetchMandatoryAddressGateDeduped`)이라 그쪽과 겹쳐도 네트워크 1회.
       * 앱 안 이동으로 그쪽이 다시 읽지 않는 경우에도 사본이 채워져 구독이 다시 판정한다(재감사2 #3 · 재감사3 범위 밖 틈).
       * 큐 키를 쓰지 않는다 — 방문 단위 「완료 키」가 남아 두 번째부터 건너뛰면 같은 틈이 다시 생긴다.
       */
      if (isStoreOwnerAdminPathname(pathnameRef.current)) {
        runNowOrScheduleOnStoreOwnerAdmin(
          async () => {
            const res = await fetchMandatoryAddressGateDeduped({ component: "DibaySignupGate", reason: "registration_owner" });
            if (!res.ok) return;
            const j = (await res.clone().json()) as { ok?: boolean; authenticated?: boolean; registrationNextStep?: string | null };
            if (j.ok === true && j.authenticated === true) setRegistrationPendingFromServer(j.registrationNextStep ?? null);
          },
          OWNER_HUB_SECONDARY_AFTER_MS.addressGate,
        );
        return "exempt";
      }
      const r = await readRegistrationFromServer({ bypassCache: false });
      if (r === "retry") return "retry";
      if (r === "guest") return "exempt";
      known = peekRegistrationPendingKnowledge();
      if (known === "unknown") return "retry";
    }
    if (known === "complete") return "complete";
    if (isRegistrationGateExemptPath(pathnameRef.current)) return "exempt";
    /** 단계 화면이 방금 이 화면으로 되돌려 보냈다 — 사본을 믿지 않고 서버에 다시(요청 캐시도 건너뜀) */
    const bounce = isRegistrationBounce(here);
    if (bounce.bounce) {
      if (bounce.repeated) {
        /** 이번엔 보내지 않는다 — 이 화면에서 쓰기가 막히면 안내 창은 열리게 표시(감사 검토 #2) */
        markRegistrationGatePassthrough(pathnameRef.current);
        return "exempt";
      }
      invalidateMandatoryAddressGateClientCache();
      invalidateRegistrationPending();
      const r = await readRegistrationFromServer({ bypassCache: true });
      if (r === "retry") return "retry";
      if (r === "guest") return "exempt";
      known = peekRegistrationPendingKnowledge();
      if (known === "complete") return "complete";
      if (known === "unknown") return "retry";
    }
    const target = resolveRegistrationGateTarget({ step: known, pathname: pathnameRef.current, returnTo: here });
    if (!target) return "exempt";
    if (redirectInFlightTargetRef.current === target) return "redirected";
    if (
      guardedRouterReplace(routerRef.current, target, {
        source: "dibay-signup-gate",
        reason: "registration_incomplete",
      })
    ) {
      redirectInFlightTargetRef.current = target;
      noteRegistrationRedirect(here);
    }
    return "redirected";
  }, []);

  /** 동의 완료 확인 뒤 공통 — 가입까지 끝났을 때만 이 로그인 동안 검사를 멈춘다 */
  const afterConsentComplete = useCallback(async () => {
    const r = await checkRegistration();
    if (r === "complete") {
      clearRetry();
      markSignupCompleteResolvedSession();
      return;
    }
    if (r === "retry") scheduleRetry();
  }, [checkRegistration, clearRetry, scheduleRetry]);

  const checkSignupGate = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!isAppBootReady()) return;
    /**
     * P2-1 (SG-05): public browse 경로도 로그인 + 미동의 회원이면 동의 화면으로 보낸다
     * (OAuth 후 약관 화면 이탈·재실행 복구). 게스트는 boot profile 이 없어 대상이 아니다.
     */
    if (isClientSignupGateExemptPath(pathnameRef.current)) return;
    if (isSignupCompleteResolvedThisSession()) return;
    if (checkInFlightRef.current) return;

    checkInFlightRef.current = (async () => {
      const boot = peekAppBootProfile();
      if (!boot?.id) return;

      const bootSignup = deriveDibaySignupStatus(boot, {
        hasSession: true,
        requiredConsent: getClientRequiredConsentVersions(),
      });
      /** SSOT_CONTRACT: dibay-signup-consent-only-gate DibaySignupGate consentComplete
       * 동의 판정 = consent only(@id·프로필을 묶지 않는다). 동의 뒤 전화·주소는 `afterConsentComplete` →
       * `registration-gate` — 목적지는 빠진 단계 화면(+ next), `/mypage` 아님 · 통화 화면 예외(방·통화 deep route 보존). */
      if (bootSignup.consentComplete) {
        clearRetry();
        markSignupConsentResolvedSession();
        await afterConsentComplete();
        return;
      }

      try {
        const returnNext =
          typeof window !== "undefined"
            ? `${window.location.pathname}${window.location.search}`
            : pathnameRef.current;
        const { status, json } = await fetchSignupStatusDeduped(returnNext);
        const outcome = classifySignupStatusResponse(status, json);
        if (outcome.kind === "retry") {
          scheduleRetry();
          return;
        }
        clearRetry();
        retryAttemptRef.current = 0;
        if (outcome.kind === "session_lost") return;
        if (outcome.kind === "complete") {
          markSignupConsentResolvedSession();
          await afterConsentComplete();
          return;
        }
        const target = outcome.target;

        if (pathnameRef.current.startsWith(target.split("?")[0] ?? target)) {
          logNetworkLoopGuardReplace({
            source: "dibay-signup-gate",
            targetUrl: target,
            reason: "already_on_target",
          });
          return;
        }
        if (redirectInFlightTargetRef.current === target) {
          logNetworkLoopGuardReplace({
            source: "dibay-signup-gate",
            targetUrl: target,
            reason: "duplicate_redirect_blocked",
          });
          return;
        }
        if (
          guardedRouterReplace(routerRef.current, target, {
            source: "dibay-signup-gate",
            reason: "signup_incomplete",
          })
        ) {
          redirectInFlightTargetRef.current = target;
        }
      } catch {
        scheduleRetry();
      }
    })().finally(() => {
      checkInFlightRef.current = null;
    });
  }, [clearRetry, scheduleRetry, afterConsentComplete]);

  useEffect(() => {
    checkSignupGateRef.current = checkSignupGate;
  }, [checkSignupGate]);

  useEffect(() => clearRetry, [clearRetry]);

  /**
   * 가입 재료가 바뀌면 곧바로 다시 판정 — 서버가 빠진 단계를 알려 줌(다른 화면 응답 포함) ·
   * 전화·주소·로그아웃으로 사본이 「모름」이 됨. 이미 「완료」로 표시됐어도 지운다(재감사 R5: 완료 뒤 대표 주소를
   * 지워도 앱을 다시 켤 때까지 다시 보지 않던 결함). 판정은 사본(메모리)으로 — 모를 때만 15초 캐시 요청 1회.
   */
  /** 완료 순간 토큰 1회 갱신은 루트 설치 `registration-complete-token-refresh` 가 맡는다(단계 화면에서도 동작) */
  useEffect(
    () =>
      subscribeRegistrationPending(() => {
        const known = peekRegistrationPendingKnowledge();
        if (known === "complete") return;
        clearSignupCompleteResolvedSession();
        redirectInFlightTargetRef.current = null;
        checkSignupGateRef.current();
      }),
    [],
  );

  useEffect(() => {
    retryAttemptRef.current = 0;
    /** 화면이 바뀌었다 = 이전 이동은 끝남 — 같은 단계 화면으로 다시 보낼 수 있게 */
    redirectInFlightTargetRef.current = null;
    if (isClientSignupGateExemptPath(pathname)) {
      clearRetry();
      return;
    }
    checkSignupGate();
  }, [pathname, checkSignupGate, clearRetry]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onBoot = () => checkSignupGate();
    window.addEventListener(APP_BOOT_READY_EVENT, onBoot);
    const unsubBoot = subscribeAppBoot(() => {
      if (getAppBootSnapshot().status === "ready") checkSignupGate();
    });
    void ensureAppBoot().then(() => checkSignupGate());

    return () => {
      window.removeEventListener(APP_BOOT_READY_EVENT, onBoot);
      unsubBoot();
    };
  }, [checkSignupGate]);

  /**
   * B11 — running app: an Admin publish of new required versions must reach a session that
   * already resolved consent. Resume re-reads signup-status (throttled); a version change resets
   * the per-session verdict and re-runs the gate with the new versions.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const unsub = subscribeClientRequiredConsentVersions(() => {
      resetSignupGateSessionFlags();
      redirectInFlightTargetRef.current = null;
      checkSignupGate();
    });
    let lastRefreshAt = 0;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!peekAppBootProfile()?.id) return;
      if (!isSignupCompleteResolvedThisSession()) {
        retryAttemptRef.current = 0;
        checkSignupGate();
      }
      const now = Date.now();
      if (now - lastRefreshAt < CONSENT_VERSION_REFRESH_MIN_MS) return;
      lastRefreshAt = now;
      void fetchSignupStatusDeduped().catch(() => {
        /* next resume retries */
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checkSignupGate]);

  return null;
}
