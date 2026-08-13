"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";
import { buildExplorationRegionSubtitleLine } from "@/lib/addresses/user-address-format";
import { mapUserAddressToAppLocation } from "@/lib/addresses/map-user-address-to-app-location";
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

function applyAddressToTradeRegion(
  addr: UserAddressDTO,
  sync: (regionId: string, cityId: string) => void,
): string | null {
  const line = (buildExplorationRegionSubtitleLine(addr) ?? "").trim();
  const inferred = mapUserAddressToAppLocation(addr);
  if (inferred) sync(inferred.regionId, inferred.cityId);
  return line && line !== "—" ? line : null;
}

type TradeDefaultLocationBlockProps = {
  editPostId?: string;
  region: string;
  city: string;
  onSyncRegionCity: (regionId: string, cityId: string) => void;
  error?: string;
  readOnly?: boolean;
  onBeforeNavigateToAddresses?: () => void | Promise<void>;
  /** 거래 지역 아래 추가 필드(예: 부동산 건물명) */
  belowRegionSlot?: ReactNode;
  denseLayout?: boolean;
};

/**
 * 거래 글쓰기 위치 — 회원 주소록 SSOT.
 * 「거래 지역」만 표시. 탭 → `/mypage/addresses` (입력·선택은 주소록만).
 * 만남장소「위치」UI는 제품에서 제거됨.
 */
export function TradeDefaultLocationBlock({
  editPostId,
  region,
  city,
  onSyncRegionCity,
  error,
  readOnly = false,
  onBeforeNavigateToAddresses,
  belowRegionSlot,
  denseLayout = false,
}: TradeDefaultLocationBlockProps) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const router = useRouter();
  const addressesHref = buildMypageAddressesHrefFromPath(
    pathname,
    searchParams?.toString() ? `?${searchParams.toString()}` : "",
  );
  const [displayLine, setDisplayLine] = useState<string | null>(null);
  const displayLineRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const syncRef = useRef(onSyncRegionCity);
  syncRef.current = onSyncRegionCity;
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
      const nextLine = applyAddressToTradeRegion(addr, (rid, cid) => {
        syncRef.current(rid, cid);
      });
      displayLineRef.current = nextLine;
      setDisplayLine(nextLine);
    } catch {
      displayLineRef.current = null;
      setDisplayLine(null);
    } finally {
      setReady(true);
    }
  }, []);

  useAddressDefaultsBootRetry(
    () => void load({ force: true }),
    () => !displayLineRef.current?.trim(),
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
      <div className={denseLayout ? "mt-0" : "mt-0"}>
        <p
          className={
            denseLayout
              ? "text-[13px] font-semibold leading-tight text-[#65676B]"
              : "mb-2 sam-text-body font-medium text-sam-fg"
          }
        >
          {t("trade_write_trade_region")} {!readOnly ? <span className="text-red-500">*</span> : null}
        </p>
        {readOnly ? (
          <p className="flex min-w-0 items-start gap-1.5 break-words sam-text-body leading-snug text-sam-fg">
            <AddressKindHeadPin kind="master" className="mt-0.5" />
            <span className="min-w-0">{currentAddressText}</span>
          </p>
        ) : (
          <button
            type="button"
            onClick={() => void handleNavigateToAddresses()}
            className={
              denseLayout
                ? "mt-0.5 flex w-full min-w-0 items-start gap-1.5 rounded-ui-rect border border-[#ccd0d5] bg-white px-2.5 py-2 text-left text-[15px] font-medium leading-snug text-[#050505] transition-colors hover:bg-[#f2f3f5] active:bg-[#e4e6eb]"
                : "mt-0 flex w-full min-w-0 items-start gap-1.5 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2.5 text-left sam-text-body leading-snug text-sam-fg transition-colors hover:bg-sam-surface-muted active:bg-sam-surface-muted"
            }
            aria-label={t("layout_neighborhood_address_aria", { line: currentAddressText })}
          >
            <AddressKindHeadPin kind="master" className="mt-0.5" />
            <span className="min-w-0 flex-1 break-words">{currentAddressText}</span>
          </button>
        )}
      </div>
      {belowRegionSlot ? <div className="mt-0">{belowRegionSlot}</div> : null}
      {error ? <p className="mt-2 sam-text-body-secondary text-red-500">{error}</p> : null}
    </section>
  );
}
