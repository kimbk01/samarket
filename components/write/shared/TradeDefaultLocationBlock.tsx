"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildTradePublicLine,
  stripCountryFromAddressDisplayLine,
} from "@/lib/addresses/user-address-format";
import { inferAppLocationIdsFromUserAddress } from "@/lib/addresses/infer-app-location-from-user-address";
import { rowToUserAddressDTO } from "@/lib/addresses/user-address-mapper";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { getLocationLabel } from "@/lib/products/form-options";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { prefetchMeAddressListIntoCache } from "@/lib/addresses/address-list-client-cache";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";

const ADDRESSES_HREF = "/mypage/addresses";

function coerceAddressRow(raw: unknown): UserAddressDTO | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if ("appRegionId" in o || "fullAddress" in o) return o as UserAddressDTO;
  return rowToUserAddressDTO(o);
}

function pickAddressForTradeWrite(defaults: { master?: unknown; trade?: unknown } | undefined): UserAddressDTO | null {
  const master = coerceAddressRow(defaults?.master ?? null);
  const trade = coerceAddressRow(defaults?.trade ?? null);
  if (master?.id) return master;
  if (trade?.id) return trade;
  return null;
}

type TradeDefaultLocationBlockProps = {
  editPostId?: string;
  region: string;
  city: string;
  onSyncRegionCity: (regionId: string, cityId: string) => void;
  error?: string;
  readOnly?: boolean;
  onBeforeNavigateToAddresses?: () => void | Promise<void>;
  karrotMeetSpotUi?: boolean;
  meetSpotLine?: string | null;
  meetSpotError?: string;
  onBeforeMeetSpotPick?: () => void | Promise<void>;
};

export function TradeDefaultLocationBlock({
  editPostId,
  region,
  city,
  onSyncRegionCity,
  error,
  readOnly = false,
  onBeforeNavigateToAddresses,
  karrotMeetSpotUi = false,
  meetSpotLine = null,
  meetSpotError,
  onBeforeMeetSpotPick,
}: TradeDefaultLocationBlockProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [displayLine, setDisplayLine] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const syncRef = useRef(onSyncRegionCity);
  syncRef.current = onSyncRegionCity;
  const pathnameLoadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathnameEffectFirstRef = useRef(true);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    try {
      const snapshot = await fetchAddressDefaultsSnapshot({ force: opts?.force === true });
      if (!snapshot?.ok || !snapshot.defaults) {
        setDisplayLine(null);
        setReady(true);
        return;
      }
      const addr = pickAddressForTradeWrite(snapshot.defaults);
      if (!addr?.id) {
        setDisplayLine(null);
        setReady(true);
        return;
      }
      const line = stripCountryFromAddressDisplayLine(
        buildTradePublicLine(addr),
        addr.countryName
      ).trim();
      setDisplayLine(line || null);
      const inferred = inferAppLocationIdsFromUserAddress(addr);
      if (inferred) syncRef.current(inferred.regionId, inferred.cityId);
    } catch {
      setDisplayLine(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (pathnameEffectFirstRef.current) {
      pathnameEffectFirstRef.current = false;
      void load();
      return;
    }
    if (pathnameLoadTimerRef.current) clearTimeout(pathnameLoadTimerRef.current);
    pathnameLoadTimerRef.current = setTimeout(() => {
      pathnameLoadTimerRef.current = null;
      void load();
    }, 200);
    return () => {
      if (pathnameLoadTimerRef.current) {
        clearTimeout(pathnameLoadTimerRef.current);
        pathnameLoadTimerRef.current = null;
      }
    };
  }, [pathname, load]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  useEffect(() => {
    const onPop = () => void load();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [load]);

  useEffect(() => {
    const onAddressesUpdated = () => void load({ force: true });
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [load]);

  /** 함수 참조가 아니라 “신규 글 + 주소 이동 훅 존재”만 본다. 부모가 `useCallback`deps에 폼 전체 상태를 넣으면 매 입력마다 참조가 바뀌어 프리페치가 폭주한다. */
  const shouldPrefetchAddressListForNavigate = typeof onBeforeNavigateToAddresses === "function";
  useEffect(() => {
    if (!shouldPrefetchAddressListForNavigate) return;
    prefetchMeAddressListIntoCache();
  }, [shouldPrefetchAddressListForNavigate]);

  const snapshotLabel = editPostId && region && city ? getLocationLabel(region, city) : null;

  const handleNavigateToAddresses = useCallback(async () => {
    if (onBeforeNavigateToAddresses) {
      try {
        await onBeforeNavigateToAddresses();
      } catch {
        return;
      }
    }
    router.push(ADDRESSES_HREF);
  }, [onBeforeNavigateToAddresses, router]);

  const currentAddressText = !ready
    ? snapshotLabel ?? "…"
    : displayLine?.trim() || snapshotLabel || "대표 주소가 없습니다. 주소 관리에서 대표 주소를 설정해 주세요.";

  return (
    <section className="border-b border-sam-border-soft bg-sam-surface px-4 py-4">
      {!karrotMeetSpotUi ? (
        <>
          <p className="mb-2 sam-text-body font-medium text-sam-fg">
            거래 지역 <span className="text-red-500">*</span>
          </p>
          <p className="break-words sam-text-body leading-snug text-sam-fg">{currentAddressText}</p>
        </>
      ) : null}
      {karrotMeetSpotUi && onBeforeMeetSpotPick && !readOnly ? (
        <div className="mt-3 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2.5 first:mt-0">
          <p className="sam-text-body font-semibold text-sam-fg">거래 희망 장소</p>
          <p className="mt-1 min-h-[2.5rem] break-words text-[13px] leading-snug text-sam-muted">
            {meetSpotLine?.trim()
              ? meetSpotLine.trim()
              : "지도에서 고르면 상호·주소가 반영됩니다. 미선택 시 저장·등록 시 대표 주소 기준 한 줄로 자동 저장됩니다."}
          </p>
          <button
            type="button"
            className="mt-2 inline-flex w-full items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px] font-semibold text-sam-fg transition-transform duration-150 hover:bg-sam-surface-muted active:scale-[0.98] active:bg-sam-surface-muted"
            onClick={() => {
              try {
                onBeforeMeetSpotPick();
              } catch {
                /* ignore */
              }
            }}
          >
            위치 선택
          </button>
          {meetSpotError ? (
            <p className="mt-1.5 text-[12px] text-red-500">{meetSpotError}</p>
          ) : null}
        </div>
      ) : null}
      {!readOnly && !karrotMeetSpotUi ? (
        onBeforeNavigateToAddresses ? (
          <button
            type="button"
            className="mt-3 inline-flex w-full items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2.5 sam-text-body font-medium text-sam-fg hover:bg-sam-app sm:w-auto"
            onClick={() => void handleNavigateToAddresses()}
          >
            주소 관리로 변경
          </button>
        ) : (
          <Link
            href={ADDRESSES_HREF}
            className="mt-3 inline-flex items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2.5 sam-text-body font-medium text-sam-fg hover:bg-sam-app"
          >
            주소 관리로 변경
          </Link>
        )
      ) : null}
      {error ? <p className="mt-2 sam-text-body-secondary text-red-500">{error}</p> : null}
    </section>
  );
}
