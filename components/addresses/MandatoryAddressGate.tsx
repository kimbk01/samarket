"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";

/** 주소 목록이 바뀐 뒤 게이트 재검사 — `AddressManagementClient.load` 등에서 발행 */
export const SAMARKET_ADDRESSES_UPDATED_EVENT = "samarket:addresses-updated";

function isGateExcludedPath(path: string): boolean {
  if (path === "/address/select" || path.startsWith("/address/select/")) return true;
  if (path === "/mypage/addresses" || path.startsWith("/mypage/addresses/")) return true;
  if (path === "/my/addresses" || path.startsWith("/my/addresses/")) return true;
  if (path === "/mypage/logout" || path.startsWith("/mypage/logout/")) return true;
  if (path === "/my/logout" || path.startsWith("/my/logout/")) return true;
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
  const [blocked, setBlocked] = useState(false);

  const runCheck = useCallback(async () => {
    const p = pathRef.current;
    if (isGateExcludedPath(p)) {
      setBlocked(false);
      return;
    }
    try {
      const s = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
      if (!s.ok) {
        setBlocked(false);
        return;
      }
      const a = await fetch("/api/me/addresses", { credentials: "include", cache: "no-store" });
      if (!a.ok) {
        setBlocked(false);
        return;
      }
      const j = (await a.json()) as { ok?: boolean; addresses?: UserAddressDTO[] };
      const rows = j.ok && Array.isArray(j.addresses) ? j.addresses : [];
      const hasRepresentative = rows.some((r) => r.isDefaultMaster);
      setBlocked(!hasRepresentative);
    } catch {
      setBlocked(false);
    }
  }, []);

  useEffect(() => {
    pathRef.current = pathname;
    void runCheck();
  }, [pathname, runCheck]);

  useEffect(() => {
    const onUpdated = () => void runCheck();
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onUpdated);
  }, [runCheck]);

  useRefetchOnPageShowRestore(() => void runCheck(), { visibilityDebounceMs: 400 });

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
        <h2 id="mandatory-address-title" className="text-[17px] font-semibold text-ui-fg">
          대표 주소가 필요해요
        </h2>
        <p id="mandatory-address-desc" className="mt-2 text-[14px] leading-relaxed text-ui-muted">
          로그인 후 서비스(거래·동네·배달)를 이용하려면 지도에서 위치를 지정한 대표 주소를 한 곳 등록해야
          합니다. 아래에서 주소를 입력해 주세요.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => router.push("/mypage/addresses")}
            className="w-full rounded-ui-rect bg-signature py-3.5 text-[15px] font-semibold text-white"
          >
            주소 입력하기
          </button>
          <button
            type="button"
            onClick={() => router.push("/mypage/logout")}
            className="w-full rounded-ui-rect border border-ig-border py-3 text-[14px] font-medium text-ui-muted"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
