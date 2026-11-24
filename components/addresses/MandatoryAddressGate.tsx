"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { isProfileSetupGateExcludedPath } from "@/lib/auth/profile-setup-flow";
import { isRegistrationGateExemptPath } from "@/lib/auth/registration-gate";
import type { DibayRegistrationStep } from "@/lib/auth/dibay-registration-steps";
import {
  invalidateRegistrationPending,
  setRegistrationPendingFromServer,
} from "@/lib/auth/registration-pending-state.client";
import { runNowOrScheduleOnStoreOwnerAdmin, OWNER_HUB_SECONDARY_AFTER_MS } from "@/lib/business/owner-hub-secondary-fetch-queue";
import { createTrailingCoalescedCallback } from "@/lib/http/coalesce-trailing-callback";
import {
  fetchMandatoryAddressGateDeduped,
  invalidateMandatoryAddressGateClientCache,
} from "@/lib/addresses/mandatory-address-gate-client";
import { getSupabaseClient } from "@/lib/supabase/client";
import { patchPlatformPopupCriticalRuntimeFlags } from "@/lib/platform-popup/popup-critical-runtime-flags";

/** 주소 목록이 바뀐 뒤 게이트 재검사 — `AddressManagementClient.load` 등에서 발행 */
export const SAMARKET_ADDRESSES_UPDATED_EVENT = "samarket:addresses-updated";

function isGateExcludedPath(path: string): boolean {
  return isProfileSetupGateExcludedPath(path) || isRegistrationGateExemptPath(path);
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
 * 가입 재료(대표 주소·빠진 가입 단계) 읽기 — `/api/me/mandatory-address-gate` (DB 함수 1회).
 * - 결과로 `registration-pending-state` 를 채운다 → 가입 관문(`DibaySignupGate`)이 그 값으로 빠진 단계 화면으로 보낸다.
 *   화면 이동은 여기서 하지 않는다(설계 `docs/audit/registration-ssot-redesign-2026-11-24.md` S1 ⑤ — 이동 주인 1곳).
 * - 팝업 critical 표식(`addressGate` = 대표 주소 없음)은 기존 의미 그대로.
 * - 재확인: 최초 · 주소/프로필 흐름 종료 · 로그인 화면 이탈 · 주소 갱신 이벤트 · 탭 복귀 · SIGNED_IN.
 */
export function MandatoryAddressGate() {
  const pathname = usePathname() ?? "";
  const pathRef = useRef(pathname);
  const prevPathForGateRef = useRef<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    patchPlatformPopupCriticalRuntimeFlags({ addressGate: blocked });
    return () => patchPlatformPopupCriticalRuntimeFlags({ addressGate: false });
  }, [blocked]);

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
      if (j.authenticated === true) setRegistrationPendingFromServer(step);
      /** 팝업 critical 표식(`addressGate`)은 기존 의미(대표 주소 없음) 그대로 */
      setBlocked(j.authenticated === true && j.needsBlock === true);
    },
    [],
  );

  const runGateFetchNow = useCallback(async () => {
    const p = pathRef.current;
    if (isGateExcludedPath(p)) {
      setBlocked(false);
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
      prevPathForGateRef.current = next;
      return;
    }

    prevPathForGateRef.current = next;

    if (!shouldRefetchGateOnPathChange(prev, next)) return;
    void runGateFetch();
  }, [pathname, runGateFetch]);

  useEffect(() => {
    const onUpdated = () => {
      invalidateRegistrationPending();
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
        invalidateRegistrationPending();
        setBlocked(false);
        return;
      }
      if (event === "SIGNED_IN") {
        /** 계정이 바뀌었을 수 있다 — 이전 계정의 빠진 단계로 미리 막지 않게 비운다(재감사3 #10) */
        invalidateRegistrationPending();
        void runGateFetch();
      }
    });
    return () => subscription.unsubscribe();
  }, [runGateFetch]);

  return null;
}
