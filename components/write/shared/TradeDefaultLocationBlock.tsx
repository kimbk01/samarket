"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { mapUserAddressToAppLocation } from "@/lib/addresses/map-user-address-to-app-location";
import { coerceUserAddressDTO } from "@/lib/addresses/coerce-user-address-dto";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { buildMypageAddressesHrefFromPath } from "@/lib/addresses/mypage-addresses-return-to";
import { resolveCanonicalChipLineFromDto } from "@/lib/addresses/canonical-address-display";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { useAddressDefaultsBootRetry } from "@/lib/addresses/use-address-defaults-boot-retry";

function pickAddressForTradeWrite(defaults: { master?: unknown } | undefined): UserAddressDTO | null {
  const master = coerceUserAddressDTO(defaults?.master ?? null);
  if (master?.id) return master;
  return null;
}

function applyAddressToTradeRegion(
  addr: UserAddressDTO,
  sync: (regionId: string, cityId: string) => void,
): string | null {
  const line = resolveCanonicalChipLineFromDto(addr).trim();
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
  onSyncRegionCity,
  error,
  readOnly = false,
  onBeforeNavigateToAddresses,
  karrotMeetSpotUi = false,
  meetSpotError,
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
        displayLineRef.current = null;
        setDisplayLine(null);
        setReady(true);
        return;
      }
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
    ? "…"
    : displayLine?.trim() || t("trade_write_no_rep_address");
  const locationLabel = karrotMeetSpotUi ? heading : t("trade_write_trade_region");
  const errorText = error || meetSpotError || "";

  return (
    <section
      className={
        denseLayout
          ? "border-b border-[#e4e6eb] bg-white px-3 py-2 sm:px-3.5"
          : "border-b border-sam-border-soft bg-sam-surface px-4 py-4"
      }
    >
      <button
        type="button"
        disabled={readOnly}
        className={
          denseLayout
            ? "mt-1.5 w-full rounded-ui-rect border border-[#e4e6eb] bg-[#f7f8fa] px-2.5 py-2 text-left first:mt-0 disabled:opacity-70"
            : "w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2.5 text-left disabled:opacity-70"
        }
        aria-label={t("layout_address_manage_aria", { line: currentAddressText })}
        onClick={() => void handleNavigateToAddresses()}
      >
        <p
          className={
            denseLayout
              ? "text-[13px] font-semibold leading-tight text-[#65676B]"
              : "sam-text-body font-semibold text-sam-fg"
          }
        >
          {locationLabel} <span className="text-red-500">*</span>
        </p>
        <p
          className={
            denseLayout
              ? "mt-0.5 break-words text-[15px] font-medium leading-snug text-[#050505]"
              : "mt-1 break-words text-[13px] leading-snug text-sam-muted"
          }
        >
          {currentAddressText}
        </p>
      </button>
      {belowMeetSpotSlot ? <div className="mt-0">{belowMeetSpotSlot}</div> : null}
      {errorText ? <p className="mt-2 sam-text-body-secondary text-red-500">{errorText}</p> : null}
    </section>
  );
}
