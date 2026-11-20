"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  isProfileSetupGateExcludedPath,
  isRegistrationGateOnlyExcludedPath,
  resolveProfileSetupGateAction,
} from "@/lib/auth/profile-setup-flow";
import { registrationStepHref, type DibayRegistrationStep } from "@/lib/auth/dibay-registration-steps";
import {
  clearProfileSetupDeferForSession,
  deferProfileSetupForSession,
  isProfileSetupDeferredForSession,
} from "@/lib/auth/profile-setup-defer.client";
import { runNowOrScheduleOnStoreOwnerAdmin, OWNER_HUB_SECONDARY_AFTER_MS } from "@/lib/business/owner-hub-secondary-fetch-queue";
import { createTrailingCoalescedCallback } from "@/lib/http/coalesce-trailing-callback";
import {
  fetchMandatoryAddressGateDeduped,
  invalidateMandatoryAddressGateClientCache,
} from "@/lib/addresses/mandatory-address-gate-client";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useStoresHomeOverlayDeferUntilInput } from "@/lib/stores/use-stores-home-overlay-defer-until-input";
import { patchPlatformPopupCriticalRuntimeFlags } from "@/lib/platform-popup/popup-critical-runtime-flags";

/** 주소 목록이 바뀐 뒤 게이트 재검사 — `AddressManagementClient.load` 등에서 발행 */
export const SAMARKET_ADDRESSES_UPDATED_EVENT = "samarket:addresses-updated";

function isGateExcludedPath(path: string): boolean {
  return isProfileSetupGateExcludedPath(path) || isRegistrationGateOnlyExcludedPath(path);
}

/** 로그인/가입 화면을 떠난 뒤에는 서버 게이트를 다시 맞춤 */
function isAuthEntryPath(path: string): boolean {
  return path === "/login" || path.startsWith("/login/") || path === "/signup" || path.startsWith("/signup/");
}

/**
 * pathname만 바뀌는 일반 이동(/philife ↔ /market 등)마다 GET 하지 않고,
 * 아래 경우에만 서버에 재확인합니다.
 * - 최초 마운트
 * - 주소·지도 제외 경로 → 일반 경로로 진입(주소 등록 플로우 종료)
 * - 로그인/가입 화면에서 이탈
 * - 주소 갱신 이벤트
 * - 탭 복귀(다른 탭에서 주소 변경 등)
 * - Supabase SIGNED_IN (세션 확보 직후)
 */
function shouldRefetchGateOnPathChange(prev: string | null, next: string): boolean {
  if (prev === null) return true;
  if (isGateExcludedPath(prev) && !isGateExcludedPath(next)) return true;
  if (isAuthEntryPath(prev)) return true;
  return false;
}

/**
 * 로그인 상태에서 가입(동의 + 전화 인증 + 대표 주소) 중 전화·주소가 빠졌으면 로그인 세션당 **1회만**
 * 빠진 가입 단계 화면(`/auth/onboarding/phone|address`)으로 보냅니다 (Owner 2026-11-09 세션당 1회 ·
 * 2026-11-20 「승인, 구현 진행」 — 목적지를 가입 단계 화면으로, 대상에 전화 미인증 추가).
 * 그 뒤로는 어디든 진입·열람 가능 — 회원 행동은 기능 게이트(`lib/profile/profile-requirements.ts`)가 요구한다.
 * 동의 미완료는 `DibaySignupGate` 담당이라 여기서 보내지 않는다. 로그아웃 시 1회 표식 초기화.
 * 주소·프로필 수정 플로우·가입 단계 경로·통화 화면은 제외합니다.
 */
export function MandatoryAddressGate() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const deferOverlayForStoresLcp = useStoresHomeOverlayDeferUntilInput();
  const pathRef = useRef(pathname);
  const prevPathForGateRef = useRef<string | null>(null);
  const redirectTargetRef = useRef<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [registrationPending, setRegistrationPending] = useState(false);

  useEffect(() => {
    patchPlatformPopupCriticalRuntimeFlags({ addressGate: blocked });
    return () => patchPlatformPopupCriticalRuntimeFlags({ addressGate: false });
  }, [blocked]);

  const stepRef = useRef<DibayRegistrationStep | null>(null);

  const maybeRedirectToSetup = useCallback(
    (needsBlock: boolean) => {
      if (deferOverlayForStoresLcp) return;
      const action = resolveProfileSetupGateAction({
        needsBlock,
        deferredForSession: isProfileSetupDeferredForSession(),
        pathname: pathRef.current,
      });
      if (action === "none") return;
      /** 로그인 세션당 1회 — 이후 둘러보기 자유, 회원 행동은 기능 게이트(profile-requirements)가 요구 */
      deferProfileSetupForSession();
      if (action === "mark_seen") return;
      const here =
        typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : pathRef.current;
      const target = registrationStepHref(stepRef.current, here);
      if (!target) return;
      if (redirectTargetRef.current === target) return;
      redirectTargetRef.current = target;
      router.replace(target);
    },
    [router, deferOverlayForStoresLcp],
  );

  const applyGateJson = useCallback(
    async (res: Response) => {
      if (res.status === 401) {
        setBlocked(false);
        return;
      }
      if (!res.ok) {
        setBlocked(false);
        return;
      }
      const j = (await res.clone().json()) as {
        ok?: boolean;
        authenticated?: boolean;
        needsBlock?: boolean;
        registrationNextStep?: DibayRegistrationStep | null;
      };
      if (!j.ok) {
        setBlocked(false);
        return;
      }
      /** 동의(terms)는 DibaySignupGate 담당 — 여기서는 전화·주소 단계만 */
      const step = j.registrationNextStep === "phone" || j.registrationNextStep === "address" ? j.registrationNextStep : null;
      stepRef.current = step;
      /** 팝업 critical 표식(`addressGate`)은 기존 의미(대표 주소 없음) 그대로 */
      setBlocked(j.authenticated === true && j.needsBlock === true);
      const needsStep = j.authenticated === true && step !== null;
      setRegistrationPending(needsStep);
      if (!needsStep) {
        redirectTargetRef.current = null;
      }
      maybeRedirectToSetup(needsStep);
    },
    [maybeRedirectToSetup],
  );

  const runGateFetchNow = useCallback(async () => {
    const p = pathRef.current;
    if (isGateExcludedPath(p)) {
      setBlocked(false);
      redirectTargetRef.current = null;
      return;
    }
    try {
      const res = await fetchMandatoryAddressGateDeduped({
        component: "MandatoryAddressGate",
        reason: "runGateFetchNow",
      });
      await applyGateJson(res);
    } catch {
      setBlocked(false);
    }
  }, [applyGateJson]);

  const runGateFetchNowRef = useRef(runGateFetchNow);
  runGateFetchNowRef.current = runGateFetchNow;
  const gateRestoreCoalesceRef = useRef(
    createTrailingCoalescedCallback(() => {
      void runGateFetchNowRef.current();
    }, 450),
  );

  const runGateFetch = useCallback(() => {
    runNowOrScheduleOnStoreOwnerAdmin(
      () => runGateFetchNow(),
      OWNER_HUB_SECONDARY_AFTER_MS.addressGate,
      "address-gate",
    );
  }, [runGateFetchNow]);

  useEffect(() => {
    pathRef.current = pathname;
    const prev = prevPathForGateRef.current;
    const next = pathname;

    if (isGateExcludedPath(next) || isAuthEntryPath(next)) {
      setBlocked(false);
      redirectTargetRef.current = null;
      prevPathForGateRef.current = next;
      return;
    }

    prevPathForGateRef.current = next;

    if (!shouldRefetchGateOnPathChange(prev, next)) {
      if (registrationPending && !isProfileSetupDeferredForSession()) {
        maybeRedirectToSetup(true);
      }
      return;
    }
    void runGateFetch();
  }, [pathname, runGateFetch, registrationPending, maybeRedirectToSetup]);

  useEffect(() => {
    const onUpdated = () => {
      invalidateMandatoryAddressGateClientCache();
      void runGateFetch();
    };
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onUpdated);
  }, [runGateFetch]);

  useEffect(() => {
    const coalesce = gateRestoreCoalesceRef.current;
    const onPageShow = (e: Event) => {
      const pe = e as PageTransitionEvent;
      if (pe.persisted) coalesce.schedule();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") coalesce.schedule();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      coalesce.cancel();
    };
  }, []);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setBlocked(false);
        setRegistrationPending(false);
        redirectTargetRef.current = null;
        clearProfileSetupDeferForSession();
        return;
      }
      if (event === "SIGNED_IN") {
        void runGateFetch();
      }
    });
    return () => subscription.unsubscribe();
  }, [runGateFetch]);

  return null;
}
