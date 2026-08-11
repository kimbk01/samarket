"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildExplorationRegionSubtitleLine } from "@/lib/addresses/user-address-format";
import { inferAppLocationIdsFromUserAddress } from "@/lib/addresses/infer-app-location-from-user-address";
import { coerceUserAddressDTO } from "@/lib/addresses/coerce-user-address-dto";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { buildMypageAddressesHrefFromPath } from "@/lib/addresses/mypage-addresses-return-to";
import { getLocationLabel } from "@/lib/products/form-options";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { prefetchMeAddressListIntoCache } from "@/lib/addresses/address-list-client-cache";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { useAddressDefaultsBootRetry } from "@/lib/addresses/use-address-defaults-boot-retry";

function pickAddressForTradeWrite(defaults: { master?: unknown; trade?: unknown } | undefined): UserAddressDTO | null {
  const master = coerceUserAddressDTO(defaults?.master ?? null);
  const trade = coerceUserAddressDTO(defaults?.trade ?? null);
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
  /** 지도·주소 한 줄 카드 제목 (기본: 거래 희망 장소) */
  meetSpotHeading?: string;
  /** 당근형 `karrotMeetSpotUi` 카드 바로 아래 — 부동산 건물명 등 */
  belowMeetSpotSlot?: ReactNode;
  /** 부동산 글쓰기 등 — 안내 문구 생략·패딩 축소 */
  denseLayout?: boolean;
  /**
   * 지도에서 거래 장소를 고른 뒤에는 주소록 기준으로 `region`/`city` 를 덮어쓰지 않음
   * (대표 주소와 핀 위치가 다를 때 검증 실패 방지).
   */
  suppressAddressBookRegionSync?: boolean;
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
  meetSpotHeading,
  belowMeetSpotSlot,
  denseLayout = false,
  suppressAddressBookRegionSync = false,
}: TradeDefaultLocationBlockProps) {
  const { t } = useI18n();
  const heading = meetSpotHeading?.trim() || t("trade_write_meet_spot_default");
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const router = useRouter();
  const addressesHref = buildMypageAddressesHrefFromPath(
    pathname,
    searchParams?.toString() ? `?${searchParams.toString()}` : ""
  );
  const [displayLine, setDisplayLine] = useState<string | null>(null);
  const displayLineRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const syncRef = useRef(onSyncRegionCity);
  syncRef.current = onSyncRegionCity;
  const suppressAddressBookSyncRef = useRef(suppressAddressBookRegionSync);
  suppressAddressBookSyncRef.current = suppressAddressBookRegionSync;
  const pathnameLoadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathnameEffectFirstRef = useRef(true);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    try {
      const snapshot = await fetchAddressDefaultsSnapshot({
        force: opts?.force === true,
        caller: "trade_default_location_block",
        reason: opts?.force === true ? "force_addresses_updated" : "composer_default_location",
      });
      if (!snapshot?.ok || !snapshot.defaults) {
        displayLineRef.current = null;
        setDisplayLine(null);
        setReady(true);
        return;
      }
      const addr = pickAddressForTradeWrite(snapshot.defaults);
      if (!addr?.id) {
        const lifeLabel = snapshot.neighborhoodFromLife?.label?.trim() || null;
        displayLineRef.current = lifeLabel;
        setDisplayLine(lifeLabel);
        setReady(true);
        return;
      }
      const line = (buildExplorationRegionSubtitleLine(addr) ?? "").trim();
      const nextLine = line && line !== t("trade_write_address_empty") && line !== "—" ? line : null;
      displayLineRef.current = nextLine;
      setDisplayLine(nextLine);
      const inferred = inferAppLocationIdsFromUserAddress(addr);
      if (inferred && !suppressAddressBookSyncRef.current) {
        syncRef.current(inferred.regionId, inferred.cityId);
      }
    } catch {
      displayLineRef.current = null;
      setDisplayLine(null);
    } finally {
      setReady(true);
    }
  }, []);

  useAddressDefaultsBootRetry(
    () => void load({ force: true }),
    () => !displayLineRef.current?.trim()
  );

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
    router.push(addressesHref);
  }, [addressesHref, onBeforeNavigateToAddresses, router]);

  const currentAddressText = !ready
    ? snapshotLabel ?? "…"
    : displayLine?.trim() || snapshotLabel || t("trade_write_no_rep_address");

  return (
    <section
      className={
        denseLayout
          ? "border-b border-[#e4e6eb] bg-white px-3 py-2 sm:px-3.5"
          : "border-b border-sam-border-soft bg-sam-surface px-4 py-4"
      }
    >
      {!karrotMeetSpotUi ? (
        <>
          <p className="mb-2 sam-text-body font-medium text-sam-fg">
            {t("trade_write_trade_region")} <span className="text-red-500">*</span>
          </p>
          <p className="break-words sam-text-body leading-snug text-sam-fg">{currentAddressText}</p>
        </>
      ) : null}
      {karrotMeetSpotUi && !readOnly ? (
        <div
          className={
            denseLayout
              ? "mt-1.5 rounded-ui-rect border border-[#e4e6eb] bg-[#f7f8fa] px-2.5 py-2 first:mt-0"
              : "mt-3 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2.5 first:mt-0"
          }
        >
          <p
            className={
              denseLayout
                ? "text-[13px] font-semibold leading-tight text-[#65676B]"
                : "sam-text-body font-semibold text-sam-fg"
            }
          >
            {heading}
          </p>
          {meetSpotLine?.trim() ? (
            <p
              className={
                denseLayout
                  ? "mt-0.5 break-words text-[15px] font-medium leading-snug text-[#050505]"
                  : "mt-1 min-h-[2.5rem] break-words text-[13px] leading-snug text-sam-muted"
              }
            >
              {meetSpotLine.trim()}
            </p>
          ) : denseLayout ? null : (
            <p className="mt-1 min-h-[2.5rem] break-words text-[13px] leading-snug text-sam-muted">
              {t("trade_write_meet_spot_map_hint")}
            </p>
          )}
          <button
            type="button"
            disabled={!onBeforeMeetSpotPick}
            title={!onBeforeMeetSpotPick ? t("trade_write_location_locked") : undefined}
            className={
              denseLayout
                ? "mt-1.5 inline-flex w-full items-center justify-center rounded-ui-rect border border-[#ccd0d5] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#050505] transition-colors hover:bg-[#f2f3f5] active:bg-[#e4e6eb] disabled:pointer-events-none disabled:opacity-50"
                : "mt-2 inline-flex w-full items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px] font-semibold text-sam-fg transition-transform duration-150 hover:bg-sam-surface-muted active:scale-[0.98] active:bg-sam-surface-muted disabled:pointer-events-none disabled:opacity-50"
            }
            onClick={() => {
              if (!onBeforeMeetSpotPick) return;
              void (async () => {
                try {
                  await onBeforeMeetSpotPick();
                } catch {
                  /* 부모(업로드·초안 저장) 실패 — 조용히 무시하지 않고 사용자가 재시도 가능 */
                }
              })();
            }}
          >
            {t("trade_write_pick_location")}
          </button>
          {meetSpotError ? (
            <p className="mt-1.5 text-[12px] text-red-500">{meetSpotError}</p>
          ) : null}
        </div>
      ) : null}
      {belowMeetSpotSlot ? <div className="mt-0">{belowMeetSpotSlot}</div> : null}
      {!readOnly && !karrotMeetSpotUi ? (
        onBeforeNavigateToAddresses ? (
          <button
            type="button"
            className="mt-3 inline-flex w-full items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2.5 sam-text-body font-medium text-sam-fg hover:bg-sam-app sm:w-auto"
            onClick={() => void handleNavigateToAddresses()}
          >
            {t("trade_write_manage_addresses")}
          </button>
        ) : (
          <Link
            href={addressesHref}
            className="mt-3 inline-flex items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2.5 sam-text-body font-medium text-sam-fg hover:bg-sam-app"
          >
            {t("trade_write_manage_addresses")}
          </Link>
        )
      ) : null}
      {error ? <p className="mt-2 sam-text-body-secondary text-red-500">{error}</p> : null}
    </section>
  );
}
