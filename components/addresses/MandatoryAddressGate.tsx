"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildProfileSetupHref, isProfileSetupGateExcludedPath } from "@/lib/auth/profile-setup-flow";
import { runNowOrScheduleOnStoreOwnerAdmin, OWNER_HUB_SECONDARY_AFTER_MS } from "@/lib/business/owner-hub-secondary-fetch-queue";
import { createTrailingCoalescedCallback } from "@/lib/http/coalesce-trailing-callback";
import {
  fetchMandatoryAddressGateDeduped,
  invalidateMandatoryAddressGateClientCache,
} from "@/lib/addresses/mandatory-address-gate-client";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useStoresHomeOverlayDeferUntilInput } from "@/lib/stores/use-stores-home-overlay-defer-until-input";

/** 주소 목록이 바뀐 뒤 게이트 재검사 — `AddressManagementClient.load` 등에서 발행 */
export const SAMARKET_ADDRESSES_UPDATED_EVENT = "samarket:addresses-updated";

function isGateExcludedPath(path: string): boolean {
  return isProfileSetupGateExcludedPath(path);
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
 * 로그인 상태에서 대표 주소(`isDefaultMaster`)가 없으면 프로필 setup 으로 보냅니다.
 * 주소·프로필 수정 플로우 경로는 제외합니다.
 */
export function MandatoryAddressGate() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const deferOverlayForStoresLcp = useStoresHomeOverlayDeferUntilInput();
  const pathRef = useRef(pathname);
  const prevPathForGateRef = useRef<string | null>(null);
  const redirectTargetRef = useRef<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const maybeRedirectToSetup = useCallback(
    (needsBlock: boolean) => {
      if (!needsBlock || deferOverlayForStoresLcp) return;
      const p = pathRef.current;
      if (isGateExcludedPath(p)) return;
      const search = typeof window !== "undefined" ? window.location.search : "";
      const target = buildProfileSetupHref({ next: `${p.split("?")[0]}${search}` });
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
      };
      if (!j.ok) {
        setBlocked(false);
        return;
      }
      const needsBlock = j.authenticated === true && j.needsBlock === true;
      setBlocked(needsBlock);
      if (!needsBlock) {
        redirectTargetRef.current = null;
      }
      maybeRedirectToSetup(needsBlock);
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
      if (blocked) {
        maybeRedirectToSetup(true);
      }
      return;
    }
    void runGateFetch();
  }, [pathname, runGateFetch, blocked, maybeRedirectToSetup]);

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
        redirectTargetRef.current = null;
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
