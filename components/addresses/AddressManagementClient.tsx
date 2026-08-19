"use client";

import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import { pushStoreOwnerMainBottomNavSuppressed } from "@/lib/business/store-owner-main-bottom-nav-suppress";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { fetchApprovedStoresByIdMap } from "@/lib/addresses/fetch-approved-stores-map";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { AddressRowCard } from "@/components/addresses/AddressRowCard";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import {
  peekMapAddressPick,
} from "@/lib/map/map-address-pick-storage";
import {
  MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS,
  MYPAGE_ADDRESS_MANAGE_SCROLL_CLASS,
  MYPAGE_ADDRESS_MANAGE_SCROLL_INNER_CLASS,
} from "@/lib/addresses/mypage-address-manage-layout";
import {
  describeMeAddressesListFailure,
  fetchMeAddressesListSingleFlight,
  shouldShowMeAddressesListMigrationHint,
  invalidateMeAddressesListClientCache,
  isMeAddressListCacheFresh,
  readCachedMeAddressList,
  writeCachedMeAddressList,
} from "@/lib/addresses/address-list-client-cache";
import {
  commitUserAddressListAfterMutation,
  shouldSkipAddressListReloadFromEvent,
} from "@/lib/addresses/user-addresses-sync";
import { translateUserAddressApiError } from "@/lib/addresses/user-address-api-error-i18n";
import { isLinkedSamarketStoreAddressRow } from "@/lib/addresses/is-linked-samarket-store-address";
import { isStoreOwnerAdminReturnTo } from "@/lib/business/owner-hub-path";
import {
  buildMypageAddressEditHref,
  buildMypageAddressSearchHref,
  parseSafeInternalReturnTo,
} from "@/lib/addresses/mypage-addresses-return-to";
import { writeAddressPlatformV2Draft } from "@/lib/addresses/canonical-address-draft-storage";
import { resolveCanonicalAddressFromLatLng } from "@/lib/addresses/canonical-address-resolver";
import { requestLocationWithDiBaYGate } from "@/lib/permissions/device-permission-manager";
import {
  ensureMemberAddressCallerContextFromTransport,
  confirmMemberAddressFlowExit,
  cancelMemberAddressFlowExit,
  clearAddressFlowExitHref,
} from "@/lib/addresses/mypage-address-flow-exit";
import {
  peekMemberAddressCallerContext,
  resolveMemberAddressExitHrefFromContext,
  setTradeWriteRegionApplyHandoff,
  writeMemberAddressCallerContext,
} from "@/lib/addresses/member-address-caller-context";
import { mapUserAddressToAppLocation } from "@/lib/addresses/map-user-address-to-app-location";
import { buildExplorationRegionSubtitleLine } from "@/lib/addresses/user-address-format";
import { broadcastUserAddressesChanged } from "@/lib/addresses/user-addresses-sync";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";
import { StoresGreenFixedHeaderChrome } from "@/components/stores/home/hub/StoresGreenFixedHeaderChrome";
import {
  STORES_HOME_HEADER_FIXED_BODY_OFFSET_CLASS,
  STORES_OWNER_APPLY_HEADER_FIRST_SECTION_GAP_CLASS,
} from "@/lib/design/stores-home-header-chrome";

export function AddressManagementClient({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const [list, setList] = useState<UserAddressDTO[]>(() => readCachedMeAddressList() ?? []);
  const listRef = useRef<UserAddressDTO[]>([]);
  listRef.current = list;
  const [listBootstrapping, setListBootstrapping] = useState(() => (readCachedMeAddressList()?.length ?? 0) === 0);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loadErrMigrationHint, setLoadErrMigrationHint] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** 승인 매장 id → 표시명 (`Store Address` 뱃지·헤더 `매장 · …` 에 사용) */
  const [approvedStoresById, setApprovedStoresById] = useState<ReadonlyMap<string, string>>(() => new Map());
  const returnTo = useMemo(() => parseSafeInternalReturnTo(sp?.get("returnTo")), [sp]);
  const storesGreenHeader = !embedded && isStoreOwnerAdminReturnTo(returnTo);

  useEffect(() => {
    if (embedded) return;
    /** CallerContext is authority; returnTo query is transport only. */
    ensureMemberAddressCallerContextFromTransport(returnTo);
  }, [embedded, returnTo]);

  useEffect(() => {
    if (!storesGreenHeader) return;
    return pushStoreOwnerMainBottomNavSuppressed();
  }, [storesGreenHeader]);
  const linkedStoreIdsInList = useMemo(
    () =>
      Array.from(
        new Set(
          list
            .filter((row) => row.labelType === "shop")
            .map((row) => row.linkedStoreId?.trim() ?? "")
            .filter(Boolean),
        ),
      ),
    [list],
  );

  useEffect(() => {
    if (!pathname || pathname.startsWith("/address/select")) return;
    if (pathname.startsWith("/mypage/addresses/edit")) return;
    if (pathname.startsWith("/mypage/addresses/search")) return;
    if (!pathname.startsWith("/mypage/addresses") && !embedded) return;
    if (peekMapAddressPick()) {
      router.replace(buildMypageAddressEditHref({ returnTo, map: true }));
    }
  }, [pathname, embedded, returnTo, router]);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    setLoadErr(null);
    setLoadErrMigrationHint(false);
    if (opts?.force) invalidateMeAddressesListClientCache();
    else if (isMeAddressListCacheFresh() && listRef.current.length > 0) return;
    const showWait = listRef.current.length === 0;
    if (showWait) setListBootstrapping(true);
    try {
      const result = await fetchMeAddressesListSingleFlight();
      if (!result.ok) {
        setLoadErr(describeMeAddressesListFailure(result, t));
        setLoadErrMigrationHint(shouldShowMeAddressesListMigrationHint(result));
        return;
      }
      const rows = result.rows;
      setList(rows);
      if (rows.length > 0) writeCachedMeAddressList(rows);
    } finally {
      if (showWait) setListBootstrapping(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onUpdated = () => {
      if (shouldSkipAddressListReloadFromEvent()) return;
      void load({ force: true });
    };
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onUpdated);
  }, [load]);

  useEffect(() => {
    if (linkedStoreIdsInList.length === 0) {
      setApprovedStoresById(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const m = await fetchApprovedStoresByIdMap();
      if (!cancelled) setApprovedStoresById(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [linkedStoreIdsInList]);

  async function removeRow(id: string) {
    if (!(await dibayConfirm({ title: t("address_delete_confirm"), cancelLabel: t("common_cancel"), confirmLabel: t("common_delete"), confirmTone: "destructive" }))) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/me/addresses/${id}`, { method: "DELETE", credentials: "include" });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        await dibayAlert({ title: translateUserAddressApiError(j.error, t, "address_delete_failed") });
        return;
      }
      const rows = await commitUserAddressListAfterMutation();
      setList(rows);
    } finally {
      setBusyId(null);
    }
  }

  function openCreate() {
    router.push(buildMypageAddressSearchHref({ returnTo }));
  }

  function openEdit(row: UserAddressDTO) {
    router.push(buildMypageAddressEditHref({ returnTo, id: row.id }));
  }

  function closeAfterRepresentativePick() {
    if (embedded) return;
    const exitHref = confirmMemberAddressFlowExit(returnTo);
    if (exitHref) {
      router.replace(exitHref);
      return;
    }
    clearAddressFlowExitHref();
    if (returnTo) router.replace(returnTo);
  }

  function handleCancelBackToCaller() {
    setTradeWriteRegionApplyHandoff(null);
    const exitHref = cancelMemberAddressFlowExit(returnTo);
    if (exitHref) {
      router.replace(exitHref);
      return;
    }
    clearAddressFlowExitHref();
    runHistoryBackWithFallback(router, "/mypage");
  }

  function confirmTradeRegionPick(id: string): boolean {
    const callerCtx = peekMemberAddressCallerContext();
    if (callerCtx?.apply.kind !== "trade_region" || !returnTo) return false;
    const row = list.find((a) => a.id === id);
    if (!row) return false;
    const inferred = mapUserAddressToAppLocation(row);
    const line = (buildExplorationRegionSubtitleLine(row) ?? "").trim();
    if (inferred && callerCtx) {
      writeMemberAddressCallerContext({
        ...callerCtx,
        selectedAddressId: id,
      });
      setTradeWriteRegionApplyHandoff({
        addressId: id,
        regionId: inferred.regionId,
        cityId: inferred.cityId,
        displayLine: line && line !== "—" ? line : inferred.cityId,
      });
    } else {
      setTradeWriteRegionApplyHandoff(null);
    }
    broadcastUserAddressesChanged();
    closeAfterRepresentativePick();
    return true;
  }

  async function openCurrentLocation() {
    setBusyId("current");
    try {
      const res = await requestLocationWithDiBaYGate({ featureKey: "delivery_address_location" });
      if (!res.ok) {
        if (res.reason !== "later") await dibayAlert({ title: t("addr_ui_geo_failed") });
        return;
      }
      const draft = await resolveCanonicalAddressFromLatLng(res.position.latitude, res.position.longitude);
      if (!draft) {
        await dibayAlert({ title: t("addr_ui_resolve_failed") });
        return;
      }
      writeAddressPlatformV2Draft({ draft, source: "current_location" });
      router.push(buildMypageAddressEditHref({ returnTo }));
    } finally {
      setBusyId(null);
    }
  }

  async function setAsRepresentative(id: string) {
    const row = list.find((a) => a.id === id);
    if (!row) return;
    if (confirmTradeRegionPick(id)) return;
    if (row.isDefaultMaster) {
      closeAfterRepresentativePick();
      return;
    }
    if (isLinkedSamarketStoreAddressRow(row)) {
      await dibayAlert({ title: t("addr_ui_store_not_master") });
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/me/addresses/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isDefaultMaster: true,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        await dibayAlert({ title: translateUserAddressApiError(j.error, t, "addr_ui_set_default_failed") });
        return;
      }
      const rows = await commitUserAddressListAfterMutation();
      setList(rows);
      closeAfterRepresentativePick();
    } finally {
      setBusyId(null);
    }
  }

  const addressListBody = (
    <>
      {loadErr ? (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-3 sam-text-body-secondary text-amber-950">
          {loadErr}
          {loadErrMigrationHint ? (
            <p className="mt-2 sam-text-helper text-amber-900/90">{t("addr_ui_migration_hint")}</p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3">
        <section className="rounded-[24px] border border-signature/10 bg-gradient-to-b from-white to-signature/[0.04] p-3 shadow-sm">
          <button
            type="button"
            onClick={openCreate}
            className="flex min-h-[52px] w-full items-center gap-3 rounded-[18px] border border-sam-border bg-white px-3 text-left shadow-[0_1px_8px_rgba(15,23,42,0.04)] transition-colors active:bg-signature/[0.04]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-signature/10 text-signature">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM20 20l-3.5-3.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block sam-text-body font-semibold text-sam-fg">{t("addr_v2_book_search_placeholder")}</span>
            </span>
            <span className="text-sam-muted" aria-hidden>
              ›
            </span>
          </button>
          <button
            type="button"
            onClick={() => void openCurrentLocation()}
            disabled={busyId === "current"}
            className="mt-2 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[18px] border border-signature/20 bg-signature/[0.06] px-3 sam-text-body font-bold text-signature transition-colors active:bg-signature/10 disabled:opacity-50"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-signature text-white" aria-hidden>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            {busyId === "current" ? t("addr_ui_locating") : t("addr_ui_find_current")}
          </button>
        </section>
        {list.length === 0 && !loadErr && listBootstrapping ? (
          <p className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface py-8 text-center sam-text-body-secondary text-sam-muted">
            {t("common_loading")}
          </p>
        ) : list.length === 0 && !loadErr ? null : (
          <ul className="space-y-2">
            {list.map((row) => (
              <AddressRowCard
                key={row.id}
                row={row}
                busyId={busyId}
                approvedStoresById={approvedStoresById}
                onSetAsRepresentative={
                  row.labelType === "shop" && (row.linkedStoreId?.trim() ?? "")
                    ? undefined
                    : () => void setAsRepresentative(row.id)
                }
                onEdit={() => openEdit(row)}
                onDelete={() => void removeRow(row.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );

  const pageBodyColumn = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        className={
          storesGreenHeader
            ? `mx-auto w-full min-w-0 max-w-[42rem] ${MYPAGE_ADDRESS_MANAGE_SCROLL_CLASS} px-[var(--delivery-page-x)] ${STORES_HOME_HEADER_FIXED_BODY_OFFSET_CLASS} ${STORES_OWNER_APPLY_HEADER_FIRST_SECTION_GAP_CLASS}`
            : MYPAGE_ADDRESS_MANAGE_SCROLL_CLASS
        }
      >
        <div
          className={
            storesGreenHeader
              ? "flex min-w-0 flex-col gap-4 py-4"
              : MYPAGE_ADDRESS_MANAGE_SCROLL_INNER_CLASS
          }
        >
          {addressListBody}
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={
        embedded
          ? ""
          : storesGreenHeader
            ? "delivery-ui flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-[color:var(--delivery-bg-main)]"
            : MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS
      }
    >
      {!embedded && storesGreenHeader ? (
        <StoresGreenFixedHeaderChrome
          title={t("address_manage_title")}
          backAriaLabel={t("business_phase7_675")}
          preferHistoryBack
        />
      ) : !embedded ? (
        <MySubpageHeader
          inlineChrome
          registerMainTier1={false}
          titleKey="addr_ui_settings_title"
          backHref={
            resolveMemberAddressExitHrefFromContext(peekMemberAddressCallerContext()) ||
            returnTo ||
            "/mypage"
          }
          preferHistoryBack={!returnTo}
          leftSlot={
            returnTo ? (
              <AppBackButton
                preferHistoryBack={false}
                onBack={handleCancelBackToCaller}
                ariaLabelKey="nav_back"
              />
            ) : undefined
          }
          hideCtaStrip
          showHubQuickActions
        />
      ) : null}
      {embedded ? (
        <div className="mx-auto flex max-w-none flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-0 py-0 pb-2">
            {addressListBody}
          </div>
        </div>
      ) : (
        pageBodyColumn
      )}
    </div>
  );
}
