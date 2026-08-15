"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { mapUserAddressToAppLocation } from "@/lib/addresses/map-user-address-to-app-location";
import { coerceUserAddressDTO } from "@/lib/addresses/coerce-user-address-dto";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { buildMypageAddressesHref, buildMypageAddressesHrefFromPath } from "@/lib/addresses/mypage-addresses-return-to";
import { formatUserAddressTitle } from "@/lib/addresses/user-address-display-ssot";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { useAddressDefaultsBootRetry } from "@/lib/addresses/use-address-defaults-boot-retry";
import { useTradeWriteSheetOptional } from "@/contexts/TradeWriteSheetContext";
import { scheduleTradeWriteSheetReopenAfterMeetSpot } from "@/lib/navigation/trade-meet-spot-return-to";

function pickAddressForTradeWrite(defaults: { master?: unknown } | undefined): UserAddressDTO | null {
  const master = coerceUserAddressDTO(defaults?.master ?? null);
  if (master?.id) return master;
  return null;
}

function applyAddressToTradeRegion(
  addr: UserAddressDTO,
  sync: (regionId: string, cityId: string) => void,
): { line: string | null; regionId: string; cityId: string } {
  const line = formatUserAddressTitle(addr)?.trim() ?? "";
  const inferred = mapUserAddressToAppLocation(addr);
  // Local Area is optional enrichment — clear when not in catalog (e.g. Davao).
  sync(inferred?.regionId ?? "", inferred?.cityId ?? "");
  return {
    line: line && line !== "—" ? line : null,
    regionId: inferred?.regionId ?? "",
    cityId: inferred?.cityId ?? "",
  };
}

async function resolveNationalLguFromAddress(addr: UserAddressDTO): Promise<{
  status: "resolved" | "ambiguous" | "unresolved";
  tradeLguId: string | null;
}> {
  const cityMunicipality = (addr.cityMunicipality ?? "").trim();
  const province = (addr.province ?? "").trim();
  if (!cityMunicipality) {
    return { status: "unresolved", tradeLguId: null };
  }
  try {
    const sp = new URLSearchParams({
      mode: "resolve",
      cityMunicipality,
    });
    if (province) sp.set("province", province);
    const res = await fetch(`/api/trade/national-lgu?${sp.toString()}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return { status: "unresolved", tradeLguId: null };
    const json = (await res.json()) as {
      resolution?: {
        status?: string;
        canonicalId?: string;
      };
    };
    const st = json.resolution?.status;
    if (st === "resolved" && typeof json.resolution?.canonicalId === "string") {
      return { status: "resolved", tradeLguId: json.resolution.canonicalId };
    }
    if (st === "ambiguous") return { status: "ambiguous", tradeLguId: null };
    return { status: "unresolved", tradeLguId: null };
  } catch {
    return { status: "unresolved", tradeLguId: null };
  }
}

function emptySsot(): TradeWriteAddressSsotSnapshot {
  return {
    ready: true,
    missing: true,
    displayLine: null,
    regionId: "",
    cityId: "",
    tradeLguId: null,
    nationalStatus: "unresolved",
    submitMeta: null,
  };
}

export type TradeWriteAddressSsotSnapshot = {
  ready: boolean;
  missing: boolean;
  displayLine: string | null;
  regionId: string;
  cityId: string;
  /** National PSGC LGU — required for Trade location validity (N3) */
  tradeLguId: string | null;
  nationalStatus: "resolved" | "ambiguous" | "unresolved" | "pending";
  submitMeta: { trade_meet_spot: { display_line: string } } | null;
};

type TradeDefaultLocationBlockProps = {
  category: CategoryWithSettings;
  editPostId?: string;
  region: string;
  city: string;
  onSyncRegionCity: (regionId: string, cityId: string) => void;
  error?: string;
  readOnly?: boolean;
  onBeforeNavigateToAddresses?: () => void | Promise<void>;
  onAddressResolved?: (snapshot: TradeWriteAddressSsotSnapshot) => void;
  karrotMeetSpotUi?: boolean;
  meetSpotLine?: string | null;
  meetSpotError?: string;
  onBeforeMeetSpotPick?: () => void | Promise<void>;
  meetSpotHeading?: string;
  belowMeetSpotSlot?: ReactNode;
  denseLayout?: boolean;
};

export function TradeDefaultLocationBlock({
  category,
  editPostId,
  onSyncRegionCity,
  error,
  readOnly = false,
  onBeforeNavigateToAddresses,
  onAddressResolved,
  karrotMeetSpotUi = false,
  meetSpotError,
  meetSpotHeading,
  belowMeetSpotSlot,
  denseLayout = false,
}: TradeDefaultLocationBlockProps) {
  const { t } = useI18n();
  const heading = meetSpotHeading?.trim() || t("trade_write_meet_spot_default");
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const router = useRouter();
  const tradeWriteSheet = useTradeWriteSheetOptional();
  const addressReturnTo = !editPostId && tradeWriteSheet ? getCategoryHref(category) : null;
  const addressesHref =
    addressReturnTo?.trim()
      ? buildMypageAddressesHref(addressReturnTo)
      : buildMypageAddressesHrefFromPath(
          pathname,
          searchParams?.toString() ? `?${searchParams.toString()}` : ""
        );
  const [displayLine, setDisplayLine] = useState<string | null>(null);
  const displayLineRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const syncRef = useRef(onSyncRegionCity);
  syncRef.current = onSyncRegionCity;
  const resolvedRef = useRef(onAddressResolved);
  resolvedRef.current = onAddressResolved;
  const requestGenerationRef = useRef(0);
  const pathnameLoadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathnameEffectFirstRef = useRef(true);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    const requestGeneration = ++requestGenerationRef.current;
    try {
      const snapshot = await fetchAddressDefaultsSnapshot({
        force: opts?.force === true,
        caller: "trade_default_location_block",
        reason: opts?.force === true ? "force_addresses_updated" : "composer_default_location",
      });
      if (requestGeneration !== requestGenerationRef.current) return;
      if (!snapshot?.ok || !snapshot.defaults) {
        displayLineRef.current = null;
        setDisplayLine(null);
        resolvedRef.current?.(emptySsot());
        setReady(true);
        return;
      }
      const addr = pickAddressForTradeWrite(snapshot.defaults);
      if (!addr?.id) {
        displayLineRef.current = null;
        setDisplayLine(null);
        resolvedRef.current?.(emptySsot());
        setReady(true);
        return;
      }
      const next = applyAddressToTradeRegion(addr, (rid, cid) => {
        syncRef.current(rid, cid);
      });
      const national = await resolveNationalLguFromAddress(addr);
      if (requestGeneration !== requestGenerationRef.current) return;
      displayLineRef.current = next.line;
      setDisplayLine(next.line);
      const nationalOk = national.status === "resolved" && !!national.tradeLguId;
      resolvedRef.current?.({
        ready: true,
        // National LGU is location validity; local Area optional.
        missing: !next.line || !nationalOk,
        displayLine: next.line,
        regionId: next.regionId,
        cityId: next.cityId,
        tradeLguId: national.tradeLguId,
        nationalStatus: national.status,
        submitMeta: next.line ? { trade_meet_spot: { display_line: next.line } } : null,
      });
    } catch {
      if (requestGeneration !== requestGenerationRef.current) return;
      displayLineRef.current = null;
      setDisplayLine(null);
      resolvedRef.current?.(emptySsot());
    } finally {
      if (requestGeneration === requestGenerationRef.current) setReady(true);
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
    if (addressReturnTo) scheduleTradeWriteSheetReopenAfterMeetSpot(addressReturnTo);
    router.push(addressesHref);
  }, [addressReturnTo, addressesHref, onBeforeNavigateToAddresses, router]);

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
        <div
          className={
            denseLayout
              ? "mt-0.5 flex min-w-0 items-start gap-1.5 text-[15px] font-medium leading-snug text-[#050505]"
              : "mt-1 flex min-w-0 items-start gap-1.5 text-[13px] leading-snug text-sam-muted"
          }
        >
          <AddressKindHeadPin kind="master" className="mt-0.5 h-4 w-4 shrink-0 [&_svg]:h-4 [&_svg]:w-[0.85rem]" />
          <span className="min-w-0 flex-1 break-words">{currentAddressText}</span>
        </div>
      </button>
      {belowMeetSpotSlot ? <div className="mt-0">{belowMeetSpotSlot}</div> : null}
      {errorText ? <p className="mt-2 sam-text-body-secondary text-red-500">{errorText}</p> : null}
    </section>
  );
}
