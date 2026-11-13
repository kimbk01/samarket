"use client";

import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Plus, Search } from "lucide-react";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { invalidateMypageSummary } from "@/lib/mypage/mypage-home-summary-client";
import { Sam } from "@/lib/ui/sam-component-classes";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import { pushStoreOwnerMainBottomNavSuppressed } from "@/lib/business/store-owner-main-bottom-nav-suppress";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { fetchApprovedStoresByIdMap } from "@/lib/addresses/fetch-approved-stores-map";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import {
  MY_STICKY_CTA_BAR_SURFACE_CLASS,
  MY_STICKY_CTA_PRIMARY_BUTTON_CLASS,
  MY_STICKY_CTA_ROW_CLASS,
} from "@/components/mypage/ds/MyStickyCta";
import { AddressRowCard } from "@/components/addresses/AddressRowCard";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import {
  peekMapAddressPick,
} from "@/lib/map/map-address-pick-storage";
import {
  MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS,
  MYPAGE_ADDRESS_MANAGE_SCROLL_CLASS,
  resolveAddressManageScrollInnerClass,
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
  buildMypageAddressMapHref,
  buildMypageAddressSearchHref,
  parseAddressFlowPurpose,
  parseSafeInternalReturnTo,
} from "@/lib/addresses/mypage-addresses-return-to";
import {
  clearAddressEditDraftV3ForAddress,
  writeAddressPlatformV2Draft,
} from "@/lib/addresses/canonical-address-draft-storage";
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
import { tapHaptic } from "@/lib/ui/tap-haptic";
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
  /** 목록 단위 잠금 (CTA-003) — 어떤 변경이든 진행 중이면 모든 행 메뉴·추가·현재 위치 비활성 */
  const listLocked = busyId != null;
  /** 변경은 성공했지만 목록 재조회 실패 (CTA-004) — 낙관적 목록 유지 + 재시도 안내 */
  const [refreshFailed, setRefreshFailed] = useState(false);
  /** 승인 매장 id → 표시명 (`Store Address` 뱃지·헤더 `매장 · …` 에 사용) */
  const [approvedStoresById, setApprovedStoresById] = useState<ReadonlyMap<string, string>>(() => new Map());
  const returnTo = useMemo(() => parseSafeInternalReturnTo(sp?.get("returnTo")), [sp]);
  const storesGreenHeader = !embedded && isStoreOwnerAdminReturnTo(returnTo);
  /** 주소 입력 시안: 배달 화면 진입(`purpose=delivery`) = 배달 주소 선택(5번), 그 밖 = 주소 관리(1번) */
  const purpose = useMemo(() => parseAddressFlowPurpose(sp?.get("purpose")), [sp]);
  const isDeliveryPurpose = purpose === "delivery" && !embedded && !storesGreenHeader;
  /** 배달 주소 선택 — 화면 안 선택(아래 버튼으로 확정). 기본값 = 대표 주소 */
  const [deliveryPickId, setDeliveryPickId] = useState<string | null>(null);

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
      setRefreshFailed(false);
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
    if (!(await dibayConfirm({ title: t("popup_q_delete_address"), cancelLabel: t("common_cancel"), confirmLabel: t("common_delete"), confirmTone: "destructive" }))) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/me/addresses/${id}`, { method: "DELETE", credentials: "include" });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        showMypageToast(translateUserAddressApiError(j.error, t, "address_delete_failed"), "error");
        return;
      }
      clearAddressEditDraftV3ForAddress(id);
      const rows = await commitUserAddressListAfterMutation();
      if (rows) {
        setList(rows);
        setRefreshFailed(false);
      } else {
        setList((prev) => prev.filter((r) => r.id !== id));
        setRefreshFailed(true);
      }
      invalidateMypageSummary();
      showMypageToast(t("mypage_s06_deleted_toast"), "success");
    } catch {
      showMypageToast(t("address_delete_failed"), "error");
    } finally {
      setBusyId(null);
    }
  }

  function openCreate() {
    router.push(buildMypageAddressSearchHref({ returnTo, purpose }));
  }

  function openEdit(row: UserAddressDTO) {
    router.push(buildMypageAddressEditHref({ returnTo, id: row.id, purpose }));
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
        if (res.reason !== "later") {
          /** 권한 거부 — 검색 화면(S2)과 같은 안내 (UX-007) */
          await dibayAlert({
            title: res.reason === "denied" ? t("addr_ui_geo_hint_default") : t("addr_ui_geo_failed"),
          });
        }
        return;
      }
      const draft = await resolveCanonicalAddressFromLatLng(res.position.latitude, res.position.longitude);
      if (!draft) {
        await dibayAlert({ title: t("popup_address_resolve_failed_title"), description: t("popup_retry_later_desc") });
        return;
      }
      writeAddressPlatformV2Draft({ draft, source: "current_location" });
      /** 시안 3번: 현재 위치도 지도에서 핀을 확인한 뒤 저장 화면으로 */
      router.push(buildMypageAddressMapHref({ returnTo, purpose }));
    } finally {
      setBusyId(null);
    }
  }

  async function setAsRepresentative(id: string, opts?: { close?: boolean }): Promise<boolean> {
    const close = opts?.close !== false;
    const row = list.find((a) => a.id === id);
    if (!row) return false;
    if (close && confirmTradeRegionPick(id)) return true;
    if (row.isDefaultMaster) {
      if (close) closeAfterRepresentativePick();
      return true;
    }
    if (isLinkedSamarketStoreAddressRow(row)) {
      showMypageToast(t("addr_ui_store_not_master"), "error");
      return false;
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
        tapHaptic("error");
        showMypageToast(translateUserAddressApiError(j.error, t, "addr_ui_set_default_failed"), "error");
        return false;
      }
      const rows = await commitUserAddressListAfterMutation();
      if (rows) {
        setList(rows);
        setRefreshFailed(false);
      } else {
        setList((prev) => prev.map((r) => ({ ...r, isDefaultMaster: r.id === id })));
        setRefreshFailed(true);
      }
      invalidateMypageSummary();
      showMypageToast(t("mypage_s06_set_master_toast"), "success");
      if (close) closeAfterRepresentativePick();
      return true;
    } catch {
      tapHaptic("error");
      showMypageToast(t("addr_ui_set_default_failed"), "error");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  /** 배달 세부 주소(호수·층)가 없는 주소 — 주문 서버 검사(`delivery_detail_address_required`)와 같은 기준 */
  function needsDeliveryDetail(row: UserAddressDTO): boolean {
    return !(row.detailAddress ?? "").trim() && !(row.unitFloorRoom ?? "").trim();
  }

  const deliveryPickRow =
    list.find((r) => r.id === deliveryPickId) ?? list.find((r) => r.isDefaultMaster) ?? null;

  /** 시안 5번 하단 버튼 — 고른 주소를 대표(배달 기준)로 정하고, 세부 주소가 없으면 배달 정보 입력(6번)으로 */
  async function confirmDeliveryPick() {
    const row = deliveryPickRow;
    if (!row) return;
    const ok = await setAsRepresentative(row.id, { close: false });
    if (!ok) return;
    if (needsDeliveryDetail(row)) {
      router.push(buildMypageAddressEditHref({ returnTo, id: row.id, purpose: "delivery" }));
      return;
    }
    tapHaptic("success");
    closeAfterRepresentativePick();
    if (!returnTo) runHistoryBackWithFallback(router, "/stores");
  }


  const addressListBody = (
    <>
      <div className="space-y-3">
        {isDeliveryPurpose ? (
          <h2 className="px-1 pt-1 text-[20px] font-bold leading-snug text-sam-fg">{t("addr_v2_search_lead")}</h2>
        ) : null}
        <section className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-3">
          <button
            type="button"
            onClick={openCreate}
            disabled={listLocked}
            data-testid="address-search-entry"
            className={`sam-press flex min-h-[52px] w-full items-center gap-3 rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 text-left disabled:opacity-45 ${Sam.focusRing}`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sam-icon-surface text-sam-primary">
              <Search className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block sam-text-body font-semibold text-sam-fg">{t("addr_v3_search_ph")}</span>
            </span>
            <span className="text-sam-muted" aria-hidden>
              ›
            </span>
          </button>
          <button
            type="button"
            onClick={() => void openCurrentLocation()}
            disabled={listLocked}
            className={`${Sam.btn.secondaryCombo} ${Sam.btn.block} ${Sam.focusRing} sam-press mt-2 gap-2 disabled:opacity-45`}
          >
            <MapPin className="h-4 w-4" aria-hidden />
            {busyId === "current" ? t("addr_ui_locating") : t("addr_ui_find_current")}
          </button>
        </section>
        {loadErr && list.length === 0 ? (
          <div>
            <MyStateView
              kind="error"
              template="list"
              error={{ message: loadErr, onRetry: () => void load({ force: true }) }}
            />
            {loadErrMigrationHint ? (
              <p className="-mt-8 px-4 pb-4 text-center sam-text-helper text-sam-muted">{t("addr_ui_migration_hint")}</p>
            ) : null}
          </div>
        ) : list.length === 0 && listBootstrapping ? (
          <MyStateView kind="loading" template="list" rows={3} />
        ) : list.length === 0 ? (
          <MyStateView
            kind="empty"
            template="list"
            empty={{
              title: t("mypage_s06_empty_title"),
              cta: (
                <button
                  type="button"
                  onClick={openCreate}
                  disabled={listLocked}
                  data-testid="address-empty-add"
                  className={`${Sam.btn.primaryCombo} ${Sam.focusRing}`}
                >
                  {t("mypage_s06_empty_cta")}
                </button>
              ),
            }}
          />
        ) : (
          <>
            {loadErr || refreshFailed ? (
              <div className="flex items-center justify-between gap-2 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-2" role="alert">
                <p className="min-w-0 flex-1 sam-text-helper text-sam-muted">
                  {loadErr || t("addr_ui_list_refresh_failed")}
                </p>
                <button
                  type="button"
                  onClick={() => void load({ force: true })}
                  className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm}`}
                >
                  {t("common_retry")}
                </button>
              </div>
            ) : null}
            <p className="px-1 pt-1 sam-text-helper font-semibold text-sam-muted">
              {isDeliveryPurpose ? t("addr_v3_saved_pick_title") : t("addr_v3_list_hint")}
            </p>
            <ul className="space-y-2" role="radiogroup" aria-label={isDeliveryPurpose ? t("addr_v3_saved_pick_title") : t("addr_v3_list_hint")}>
              {list.map((row) => {
                const storeLinked = row.labelType === "shop" && Boolean(row.linkedStoreId?.trim() ?? "");
                if (isDeliveryPurpose) {
                  const picked = deliveryPickRow?.id === row.id;
                  return (
                    <AddressRowCard
                      key={row.id}
                      row={row}
                      busyId={busyId}
                      approvedStoresById={approvedStoresById}
                      radio={{ checked: picked, disabled: storeLinked }}
                      notice={!storeLinked && needsDeliveryDetail(row) ? t("addr_v3_need_detail") : null}
                      onSetAsRepresentative={storeLinked ? undefined : () => void setAsRepresentative(row.id, { close: false })}
                      onPrimaryTap={
                        storeLinked
                          ? undefined
                          : () => {
                              if (!picked) tapHaptic("select");
                              setDeliveryPickId(row.id);
                            }
                      }
                      onEdit={() => openEdit(row)}
                      onDelete={() => void removeRow(row.id)}
                    />
                  );
                }
                return (
                  <AddressRowCard
                    key={row.id}
                    row={row}
                    busyId={busyId}
                    approvedStoresById={approvedStoresById}
                    radio={{ checked: row.isDefaultMaster === true, disabled: storeLinked }}
                    onSetAsRepresentative={storeLinked ? undefined : () => void setAsRepresentative(row.id)}
                    onPrimaryTap={
                      storeLinked
                        ? () => openEdit(row)
                        : () => {
                            if (!row.isDefaultMaster) tapHaptic("select");
                            void setAsRepresentative(row.id);
                          }
                    }
                    onEdit={() => openEdit(row)}
                    onDelete={() => void removeRow(row.id)}
                  />
                );
              })}
            </ul>
          </>
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
              : resolveAddressManageScrollInnerClass(pathname, embedded)
          }
        >
          {addressListBody}
        </div>
      </div>
      {isDeliveryPurpose && deliveryPickRow ? (
        /** 시안 5번 하단 버튼 — 고른 주소의 세부 주소 여부로 문구가 바뀐다 */
        <div className={`shrink-0 ${MY_STICKY_CTA_BAR_SURFACE_CLASS} pb-[var(--safe-bottom,0px)]`}>
          <div className={MY_STICKY_CTA_ROW_CLASS}>
            <button
              type="button"
              disabled={listLocked}
              onClick={() => void confirmDeliveryPick()}
              data-testid="address-delivery-confirm"
              className={`${MY_STICKY_CTA_PRIMARY_BUTTON_CLASS} sam-press`}
            >
              {needsDeliveryDetail(deliveryPickRow) ? t("addr_v3_cta_add_detail") : t("addr_v3_cta_deliver_here")}
            </button>
          </div>
        </div>
      ) : null}
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
          titleKey={isDeliveryPurpose ? "addr_v3_delivery_title" : "addr_ui_settings_title"}
          titleOverridesIa={isDeliveryPurpose}
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
          rightSlot={
            <button
              type="button"
              onClick={openCreate}
              disabled={listLocked}
              data-testid="address-header-add"
              className={`sam-header-action inline-flex min-h-[44px] items-center gap-1 pl-2 pr-3 sam-text-body font-semibold text-sam-primary disabled:opacity-45 ${Sam.focusRing}`}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t("mypage_s06_header_add")}
            </button>
          }
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
