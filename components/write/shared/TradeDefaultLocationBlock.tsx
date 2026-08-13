"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AddressBookPickerList } from "@/components/addresses/AddressBookPickerList";
import { buildExplorationRegionSubtitleLine } from "@/lib/addresses/user-address-format";
import { mapUserAddressToAppLocation } from "@/lib/addresses/map-user-address-to-app-location";
import { coerceUserAddressDTO } from "@/lib/addresses/coerce-user-address-dto";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { buildMypageAddressesHrefFromPath } from "@/lib/addresses/mypage-addresses-return-to";
import { getLocationLabel } from "@/lib/products/form-options";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import {
  describeMeAddressesListFailure,
  fetchMeAddressesListSingleFlight,
  prefetchMeAddressListIntoCache,
  readCachedMeAddressList,
  writeCachedMeAddressList,
} from "@/lib/addresses/address-list-client-cache";
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
  karrotMeetSpotUi?: boolean;
  meetSpotLine?: string | null;
  meetSpotError?: string;
  onBeforeMeetSpotPick?: () => void | Promise<void>;
  meetSpotHeading?: string;
  belowMeetSpotSlot?: ReactNode;
  denseLayout?: boolean;
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerList, setPickerList] = useState<UserAddressDTO[]>(() => readCachedMeAddressList() ?? []);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
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
      setPickedId(addr.id);
      const nextLine = applyAddressToTradeRegion(addr, (rid, cid) => {
        if (!suppressAddressBookSyncRef.current) syncRef.current(rid, cid);
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

  const shouldPrefetchAddressListForNavigate = typeof onBeforeNavigateToAddresses === "function";
  useEffect(() => {
    if (!shouldPrefetchAddressListForNavigate) return;
    prefetchMeAddressListIntoCache();
  }, [shouldPrefetchAddressListForNavigate]);

  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    setPickerLoading(true);
    setPickerError(null);
    void fetchMeAddressesListSingleFlight()
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setPickerError(describeMeAddressesListFailure(result, t, "philife_addr_list_load_failed"));
          return;
        }
        setPickerList(result.rows);
        if (result.rows.length > 0) writeCachedMeAddressList(result.rows);
      })
      .catch(() => {
        if (!cancelled) setPickerError(t("philife_addr_list_network_failed"));
      })
      .finally(() => {
        if (!cancelled) setPickerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pickerOpen, t]);

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

  const handlePickSavedAddress = useCallback(
    (row: UserAddressDTO) => {
      setPickedId(row.id);
      const nextLine = applyAddressToTradeRegion(row, (rid, cid) => syncRef.current(rid, cid));
      displayLineRef.current = nextLine;
      setDisplayLine(nextLine);
      setPickerOpen(false);
    },
    [],
  );

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
                  /* parent may stage draft — user can retry */
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
      {!readOnly ? (
        <div className={denseLayout ? "mt-2 flex flex-wrap gap-2" : "mt-3 flex flex-wrap gap-2"}>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body font-medium text-sam-fg hover:bg-sam-app"
            onClick={() => setPickerOpen(true)}
          >
            {t("trade_write_location_select_region")}
          </button>
          {onBeforeNavigateToAddresses ? (
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body font-medium text-sam-fg hover:bg-sam-app"
              onClick={() => void handleNavigateToAddresses()}
            >
              {t("trade_write_manage_addresses")}
            </button>
          ) : (
            <Link
              href={addressesHref}
              className="inline-flex items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body font-medium text-sam-fg hover:bg-sam-app"
            >
              {t("trade_write_manage_addresses")}
            </Link>
          )}
        </div>
      ) : null}
      {error ? <p className="mt-2 sam-text-body-secondary text-red-500">{error}</p> : null}
      {pickerOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[120]" role="presentation">
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label={t("philife_addr_close_menu_aria")}
                onClick={() => setPickerOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                className="absolute inset-x-0 bottom-0 max-h-[min(78dvh,560px)] overflow-hidden rounded-t-[16px] bg-white shadow-lg"
              >
                <div className="flex items-center justify-between border-b border-sam-border px-4 py-3">
                  <h2 className="text-[16px] font-bold text-sam-fg">{t("trade_write_trade_region")}</h2>
                  <button
                    type="button"
                    className="text-[13px] font-semibold text-sam-primary"
                    onClick={() => void handleNavigateToAddresses()}
                  >
                    {t("trade_write_manage_addresses")}
                  </button>
                </div>
                <div className="max-h-[min(60dvh,480px)] overflow-y-auto px-3 py-2">
                  <AddressBookPickerList
                    list={pickerList}
                    loading={pickerLoading}
                    error={pickerError}
                    selectedId={pickedId}
                    onSelect={handlePickSavedAddress}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
