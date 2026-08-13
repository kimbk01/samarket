"use client";

/**
 * MEMBER ADDRESS BOOK — 목록·대표/배달 지정·확인.
 * 추가/수정 입력은 항상 `/mypage/addresses/edit` 페이지 스택 (모달 에디터 없음).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { pushStoreOwnerMainBottomNavSuppressed } from "@/lib/business/store-owner-main-bottom-nav-suppress";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { fetchApprovedStoresByIdMap } from "@/lib/addresses/fetch-approved-stores-map";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { AddressRowCard } from "@/components/addresses/AddressRowCard";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { peekMapAddressPick } from "@/lib/map/map-address-pick-storage";
import { ADDR_ADD_CTA, ADDR_BOTTOM_INNER, ADDR_LIST_CARD } from "@/lib/ui/address-flow-viber";
import {
  MYPAGE_ADDRESS_MANAGE_FOOTER_WRAP_CLASS,
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
  broadcastUserAddressesChanged,
  commitUserAddressListAfterMutation,
  shouldSkipAddressListReloadFromEvent,
} from "@/lib/addresses/user-addresses-sync";
import { translateUserAddressApiError } from "@/lib/addresses/user-address-api-error-i18n";
import { isLinkedSamarketStoreAddressRow } from "@/lib/addresses/is-linked-samarket-store-address";
import { isStoreOwnerAdminReturnTo } from "@/lib/business/owner-hub-path";
import {
  navigateToMemberAddressEdit,
  parseSafeInternalReturnTo,
  resolveAddressFlowEntryPath,
} from "@/lib/addresses/mypage-addresses-return-to";
import { clearAddressEditorSession } from "@/lib/addresses/address-editor-page-draft";
import {
  confirmMemberAddressFlowExit,
  cancelMemberAddressFlowExit,
  ensureMemberAddressCallerContextFromTransport,
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
  const [pickedId, setPickedId] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const [approvedStoresById, setApprovedStoresById] = useState<ReadonlyMap<string, string>>(() => new Map());

  const returnToFromQuery = useMemo(() => parseSafeInternalReturnTo(sp?.get("returnTo")), [sp]);
  /** embedded(온보딩 등)에서도 edit 복귀는 현재 화면으로 고정 */
  const editReturnTo = useMemo(() => {
    if (returnToFromQuery) return returnToFromQuery;
    if (embedded) {
      return resolveAddressFlowEntryPath(
        pathname,
        typeof window !== "undefined" ? window.location.search : sp?.toString() ? `?${sp.toString()}` : "",
      );
    }
    return "";
  }, [returnToFromQuery, embedded, pathname, sp]);

  const selectingForReturn = Boolean(returnToFromQuery);
  const storesGreenHeader = !embedded && isStoreOwnerAdminReturnTo(returnToFromQuery);

  useEffect(() => {
    /** 목록이 SSOT 게이트 — edit/fine-tune 잔여 session 정리 (stale draft 방지) */
    if (!embedded) clearAddressEditorSession();
  }, [embedded]);

  useEffect(() => {
    if (embedded) return;
    /** CallerContext is authority; returnTo query is transport only (never pathname→caller). */
    ensureMemberAddressCallerContextFromTransport(returnToFromQuery);
  }, [embedded, returnToFromQuery]);

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
    if (!selectingForReturn) return;
    if (pickedId) return;
    const master = list.find((a) => a.isDefaultMaster);
    if (master?.id) setPickedId(master.id);
  }, [selectingForReturn, list, pickedId]);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/address/select")) return;
    if (pathname.startsWith("/mypage/addresses/edit")) return;
    if (pathname.startsWith("/mypage/addresses/fine-tune")) return;
    if (!pathname.startsWith("/mypage/addresses") && !embedded) return;
    if (peekMapAddressPick()) {
      navigateToMemberAddressEdit(router, {
        returnTo: editReturnTo || returnToFromQuery || null,
        map: true,
        replace: true,
      });
    }
  }, [pathname, embedded, router, editReturnTo, returnToFromQuery]);

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
    if (!confirm(t("address_delete_confirm"))) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/me/addresses/${id}`, { method: "DELETE", credentials: "include" });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        alert(translateUserAddressApiError(j.error, t, "address_delete_failed"));
        return;
      }
      const rows = await commitUserAddressListAfterMutation();
      setList(rows);
    } finally {
      setBusyId(null);
    }
  }

  function openCreate() {
    navigateToMemberAddressEdit(router, {
      returnTo: editReturnTo || returnToFromQuery || null,
      replace: !embedded,
    });
  }

  function openEdit(row: UserAddressDTO) {
    navigateToMemberAddressEdit(router, {
      returnTo: editReturnTo || returnToFromQuery || null,
      id: row.id,
      replace: !embedded,
    });
  }

  async function setAsRepresentative(id: string) {
    const row = list.find((a) => a.id === id);
    if (!row || row.isDefaultMaster) return;
    if (isLinkedSamarketStoreAddressRow(row)) {
      alert(t("addr_ui_store_not_master"));
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
        alert(translateUserAddressApiError(j.error, t, "addr_ui_set_default_failed"));
        return;
      }
      const rows = await commitUserAddressListAfterMutation();
      setList(rows);
    } finally {
      setBusyId(null);
    }
  }

  async function setAsDelivery(id: string) {
    const row = list.find((a) => a.id === id);
    if (!row || row.isDefaultDelivery) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/me/addresses/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isDefaultDelivery: true,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        alert(translateUserAddressApiError(j.error, t, "addr_ui_set_delivery_failed"));
        return;
      }
      const rows = await commitUserAddressListAfterMutation();
      setList(rows);
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirm() {
    if (confirming) return;
    setConfirming(true);
    try {
      const callerCtx = peekMemberAddressCallerContext();
      if (selectingForReturn) {
        const id = pickedId || list.find((a) => a.isDefaultMaster)?.id || "";
        if (!id) {
          alert(t("addr_ui_add_first"));
          return;
        }
        const row = list.find((a) => a.id === id) ?? null;
        if (callerCtx?.apply.kind === "trade_region") {
          const inferred = row ? mapUserAddressToAppLocation(row) : null;
          const line = row ? (buildExplorationRegionSubtitleLine(row) ?? "").trim() : "";
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
        } else if (callerCtx?.apply.kind === "set_default_delivery") {
          setTradeWriteRegionApplyHandoff(null);
          await setAsDelivery(id);
        } else if (!isStoreOwnerAdminReturnTo(returnToFromQuery) && callerCtx?.caller !== "owner") {
          setTradeWriteRegionApplyHandoff(null);
          await setAsRepresentative(id);
        } else {
          setTradeWriteRegionApplyHandoff(null);
          broadcastUserAddressesChanged();
        }
      } else {
        setTradeWriteRegionApplyHandoff(null);
        broadcastUserAddressesChanged();
      }
      if (embedded) {
        return;
      }
      const exitHref = confirmMemberAddressFlowExit(returnToFromQuery);
      if (exitHref) {
        router.replace(exitHref);
        return;
      }
      clearAddressFlowExitHref();
      runHistoryBackWithFallback(router, "/mypage");
    } finally {
      setConfirming(false);
    }
  }

  function handleCancelBackToCaller() {
    setTradeWriteRegionApplyHandoff(null);
    const exitHref = cancelMemberAddressFlowExit(returnToFromQuery);
    if (exitHref) {
      router.replace(exitHref);
      return;
    }
    clearAddressFlowExitHref();
    runHistoryBackWithFallback(router, "/mypage");
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

      <div>
        {list.length === 0 && !loadErr && listBootstrapping ? (
          <p className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface py-8 text-center sam-text-body-secondary text-sam-muted">
            {t("common_loading")}
          </p>
        ) : list.length === 0 && !loadErr ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <button type="button" onClick={openCreate} className="rounded-full border border-sam-border bg-white px-5 py-2.5 sam-text-body font-semibold text-sam-fg">
              {t("address_add")}
            </button>
          </div>
        ) : (
          <ul className={`space-y-2 p-2 ${ADDR_LIST_CARD}`}>
            {list.map((row) => (
              <AddressRowCard
                key={row.id}
                row={row}
                busyId={busyId}
                approvedStoresById={approvedStoresById}
                onSetAsRepresentative={
                  selectingForReturn
                    ? () => setPickedId(row.id)
                    : row.labelType === "shop" && (row.linkedStoreId?.trim() ?? "")
                      ? undefined
                      : () => void setAsRepresentative(row.id)
                }
                onSetAsDelivery={
                  selectingForReturn ? undefined : () => void setAsDelivery(row.id)
                }
                onEdit={() => openEdit(row)}
                onDelete={() => void removeRow(row.id)}
                containerClassName={
                  selectingForReturn && pickedId === row.id
                    ? "rounded-ui-rect bg-signature/10 ring-2 ring-signature/35"
                    : ""
                }
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );

  const managementActionBar = (
    <div
      className={
        storesGreenHeader && !embedded
          ? "delivery-ui z-30 w-full min-w-0 shrink-0 border-t border-[color:var(--delivery-border)] bg-[color:var(--delivery-bg-card)] safe-area-pb"
          : MYPAGE_ADDRESS_MANAGE_FOOTER_WRAP_CLASS
      }
    >
      <div className={ADDR_BOTTOM_INNER}>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={confirming || (selectingForReturn && list.length > 0 && !pickedId)}
            className="w-full rounded-ui-rect bg-signature py-3.5 sam-text-body font-semibold text-white disabled:opacity-50"
          >
            {confirming ? t("common_processing") : t("common_confirm")}
          </button>
          <button type="button" onClick={openCreate} className={ADDR_ADD_CTA}>
            {t("address_add")}
          </button>
        </div>
      </div>
    </div>
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
      {list.length > 0 || selectingForReturn ? managementActionBar : null}
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
          titleKey="address_manage_title"
          backHref={
            resolveMemberAddressExitHrefFromContext(peekMemberAddressCallerContext()) ||
            returnToFromQuery ||
            "/mypage"
          }
          preferHistoryBack={false}
          leftSlot={
            <AppBackButton
              preferHistoryBack={false}
              onBack={handleCancelBackToCaller}
              ariaLabelKey="nav_back"
            />
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
          {list.length > 0 || selectingForReturn ? managementActionBar : null}
        </div>
      ) : (
        pageBodyColumn
      )}
    </div>
  );
}
