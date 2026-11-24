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
  resetSignupGateSessionFlags,
} from "@/lib/auth/signup-gate-session";
import { classifySignupStatusResponse, signupGateRetryDelayMs } from "@/lib/auth/signup-gate-decision";
import { guardedRouterReplace, logNetworkLoopGuardReplace } from "@/lib/dev/network-loop-guard";
import { isRegistrationGateExemptPath, resolveRegistrationGateTarget } from "@/lib/auth/registration-gate";
import {
  peekRegistrationPendingKnowledge,
  setRegistrationPendingFromServer,
  subscribeRegistrationPending,
} from "@/lib/auth/registration-pending-state.client";
import { fetchMandatoryAddressGateDeduped } from "@/lib/addresses/mandatory-address-gate-client";

/** Resume refresh of required consent versions — at most once per minute. */
const CONSENT_VERSION_REFRESH_MIN_MS = 60_000;

type RegistrationCheck = "complete" | "redirected" | "exempt" | "retry";

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
      try {
        const res = await fetchMandatoryAddressGateDeduped({ component: "DibaySignupGate", reason: "registration" });
        if (!res.ok) return "retry";
        const j = (await res.clone().json()) as {
          ok?: boolean;
          authenticated?: boolean;
          registrationNextStep?: string | null;
        };
        if (j.ok !== true) return "retry";
        /** 비로그인(세션 없음) — 가입 관문 대상 아님 */
        if (j.authenticated !== true) return "exempt";
        setRegistrationPendingFromServer(j.registrationNextStep ?? null);
      } catch {
        return "retry";
      }
      known = peekRegistrationPendingKnowledge();
      if (known === "unknown") return "retry";
    }
    if (known === "complete") return "complete";
    if (isRegistrationGateExemptPath(pathnameRef.current)) return "exempt";
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

  /** 서버가 빠진 단계를 알려 주면(다른 화면의 응답 포함) 곧바로 다시 판정 */
  useEffect(
    () =>
      subscribeRegistrationPending(() => {
        if (isSignupCompleteResolvedThisSession()) return;
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
