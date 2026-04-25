"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";

/** 주소 목록이 바뀐 뒤 게이트 재검사 — `AddressManagementClient.load` 등에서 발행 */
export const SAMARKET_ADDRESSES_UPDATED_EVENT = "samarket:addresses-updated";

const GATE_FETCH_FLIGHT = "mandatory-address-gate:GET:/api/me/mandatory-address-gate";

function isGateExcludedPath(path: string): boolean {
  if (path === "/address/select" || path.startsWith("/address/select/")) return true;
  if (path === "/mypage/addresses" || path.startsWith("/mypage/addresses/")) return true;
  if (path === "/my/addresses" || path.startsWith("/my/addresses/")) return true;
  if (path === "/mypage/logout" || path.startsWith("/mypage/logout/")) return true;
  if (path === "/my/logout" || path.startsWith("/my/logout/")) return true;
  return false;
}

/** 로그인/가입 화면을 떠난 뒤에는 서버 게이트를 다시 맞춤 */
function isAuthEntryPath(path: string): boolean {
  return path === "/login" || path.startsWith("/login/") || path === "/signup" || path.startsWith("/signup/");
}

/**
 * pathname만 바뀌는 일반 이동(/home ↔ /market 등)마다 GET 하지 않고,
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
 * 로그인 상태에서 대표 주소(`isDefaultMaster`)가 없으면 나머지 화면을 막고
 * 주소 등록(주소 관리)으로 보냅니다. 주소·지도 플로우 경로는 제외합니다.
 */
export function MandatoryAddressGate() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const pathRef = useRef(pathname);
  const prevPathForGateRef = useRef<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const applyGateJson = useCallback(async (res: Response) => {
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
    setBlocked(j.authenticated === true && j.needsBlock === true);
  }, []);

  const runGateFetch = useCallback(async () => {
    const p = pathRef.current;
    if (isGateExcludedPath(p)) {
      setBlocked(false);
      return;
    }
    try {
      const res = await runSingleFlight(GATE_FETCH_FLIGHT, () =>
        fetch("/api/me/mandatory-address-gate", {
          credentials: "include",
          cache: "no-store",
        })
      );
      await applyGateJson(res);
    } catch {
      setBlocked(false);
    }
  }, [applyGateJson]);

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

    if (!shouldRefetchGateOnPathChange(prev, next)) {
      return;
    }
    void runGateFetch();
  }, [pathname, runGateFetch]);

  useEffect(() => {
    const onUpdated = () => void runGateFetch();
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onUpdated);
  }, [runGateFetch]);

  useRefetchOnPageShowRestore(() => void runGateFetch(), { visibilityDebounceMs: 400 });

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setBlocked(false);
        return;
      }
      if (event === "SIGNED_IN") {
        void runGateFetch();
      }
    });
    return () => subscription.unsubscribe();
  }, [runGateFetch]);

  if (!blocked) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex flex-col justify-end bg-black/50 sm:items-center sm:justify-center sm:p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="mandatory-address-title"
      aria-describedby="mandatory-address-desc"
    >
      <div className="w-full max-w-lg rounded-t-[length:var(--ui-radius-rect)] bg-ui-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5 shadow-xl sm:rounded-ui-rect sm:p-6">
        <h2 id="mandatory-address-title" className="sam-text-section-title font-semibold text-ui-fg">
          대표 주소가 필요해요
        </h2>
        <p id="mandatory-address-desc" className="mt-2 sam-text-body leading-relaxed text-ui-muted">
          로그인 후 서비스(거래·동네·배달)를 이용하려면 지도에서 위치를 지정한 대표 주소를 한 곳 등록해야
          합니다. 아래에서 주소를 입력해 주세요.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => router.push("/mypage/addresses")}
            className="w-full rounded-ui-rect bg-signature py-3.5 sam-text-body font-semibold text-white"
          >
            주소 입력하기
          </button>
          <button
            type="button"
            onClick={() => router.push("/mypage/logout")}
            className="w-full rounded-ui-rect border border-sam-border py-3 sam-text-body font-medium text-ui-muted"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
