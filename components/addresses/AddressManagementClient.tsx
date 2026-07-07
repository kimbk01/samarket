"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { pushStoreOwnerMainBottomNavSuppressed } from "@/lib/business/store-owner-main-bottom-nav-suppress";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { fetchApprovedStoresByIdMap } from "@/lib/addresses/fetch-approved-stores-map";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { AddressRowCard } from "@/components/addresses/AddressRowCard";
import { AddressEditorSheet } from "@/components/addresses/AddressEditorSheet";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import {
  consumeMapAddressPick,
  consumeMapAddressPickContext,
  peekMapAddressPick,
} from "@/lib/map/map-address-pick-storage";
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
  buildMypageAddressEditHref,
  parseSafeInternalReturnTo,
} from "@/lib/addresses/mypage-addresses-return-to";
import {
  resolveAddressManagementExitHref,
  clearAddressFlowExitHref,
  writeAddressFlowExitHref,
} from "@/lib/addresses/mypage-address-flow-exit";
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
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editTarget, setEditTarget] = useState<UserAddressDTO | null>(null);
  const [pickedId, setPickedId] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  /** 승인 매장 id → 표시명 (`Store Address` 뱃지·헤더 `매장 · …` 에 사용) */
  const [approvedStoresById, setApprovedStoresById] = useState<ReadonlyMap<string, string>>(() => new Map());
  /** `/address/select` 에서 돌아올 때 sessionStorage 픽을 부모가 소비해 시트에 넘김 (시트가 닫힌 채 복귀하면 기존 useEffect(open) 만으로는 픽이 반영되지 않음) */
  const [mapBootstrap, setMapBootstrap] = useState<{
    latitude: number;
    longitude: number;
    fullAddress: string;
    addressDetail?: string | null;
  } | null>(null);
  const returnTo = useMemo(() => parseSafeInternalReturnTo(sp?.get("returnTo")), [sp]);
  const selectingForReturn = Boolean(returnTo);
  const storesGreenHeader = !embedded && isStoreOwnerAdminReturnTo(returnTo);

  useEffect(() => {
    if (embedded || !returnTo) return;
    writeAddressFlowExitHref(returnTo);
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
    if (!selectingForReturn) return;
    if (pickedId) return;
    const master = list.find((a) => a.isDefaultMaster);
    if (master?.id) setPickedId(master.id);
  }, [selectingForReturn, list, pickedId]);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/address/select")) return;
    if (pathname.startsWith("/mypage/addresses/edit")) return;

    if (!embedded) {
      if (!pathname.startsWith("/mypage/addresses")) return;
      if (peekMapAddressPick()) {
        router.replace(buildMypageAddressEditHref({ returnTo, map: true }));
      }
      return;
    }

    const pick = consumeMapAddressPick();
    const ctx = consumeMapAddressPickContext();
    if (!pick) return;
    const boot = {
      latitude: pick.latitude,
      longitude: pick.longitude,
      fullAddress: pick.fullAddress,
      addressDetail: pick.addressDetail ?? null,
    };

    const applyMapPickAsCreate = () => {
      setMapBootstrap(boot);
      setEditorMode("create");
      setEditTarget(null);
      setEditorOpen(true);
    };

    if (ctx.source === "edit") {
      const row = list.find((a) => a.id === ctx.addressId);
      if (row) {
        setMapBootstrap(boot);
        setEditorMode("edit");
        setEditTarget(row);
        setEditorOpen(true);
        return;
      }
      void (async () => {
        try {
          const result = await fetchMeAddressesListSingleFlight();
          const found = result.ok ? result.rows.find((a) => a.id === ctx.addressId) : undefined;
          if (found) {
            setMapBootstrap(boot);
            setEditorMode("edit");
            setEditTarget(found);
            setEditorOpen(true);
          } else {
            applyMapPickAsCreate();
          }
        } catch {
          applyMapPickAsCreate();
        }
      })();
      return;
    }

    applyMapPickAsCreate();
  }, [pathname, list, embedded, router]);

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
    if (!embedded) {
      router.replace(buildMypageAddressEditHref({ returnTo }));
      return;
    }
    setMapBootstrap(null);
    setEditorMode("create");
    setEditTarget(null);
    setEditorOpen(true);
  }

  function openEdit(row: UserAddressDTO) {
    if (!embedded) {
      router.replace(buildMypageAddressEditHref({ returnTo, id: row.id }));
      return;
    }
    setMapBootstrap(null);
    setEditorMode("edit");
    setEditTarget(row);
    setEditorOpen(true);
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
          isDefaultLife: true,
          isDefaultTrade: true,
          isDefaultDelivery: true,
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

  async function handleConfirm() {
    if (confirming) return;
    setConfirming(true);
    try {
      if (selectingForReturn) {
        const id = pickedId || list.find((a) => a.isDefaultMaster)?.id || "";
        if (!id) {
          alert(t("addr_ui_add_first"));
          return;
        }
        /** 매장 설정 복귀 — 매장 주소 연결만 확인, 대표 주소 PATCH 금지(서버 400 방지) */
        if (!isStoreOwnerAdminReturnTo(returnTo)) {
          await setAsRepresentative(id);
        } else {
          broadcastUserAddressesChanged();
        }
      } else {
        broadcastUserAddressesChanged();
      }
      if (embedded) {
        return;
      }
      const exitHref = resolveAddressManagementExitHref(returnTo);
      clearAddressFlowExitHref();
      if (exitHref) {
        router.replace(exitHref);
        return;
      }
      runHistoryBackWithFallback(router, "/mypage");
    } finally {
      setConfirming(false);
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

      <div>
        {list.length === 0 && !loadErr && listBootstrapping ? (
          <p className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface py-8 text-center sam-text-body-secondary text-sam-muted">
            {t("common_loading")}
          </p>
        ) : list.length === 0 && !loadErr ? (
          <p className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface py-8 text-center sam-text-body-secondary text-sam-muted">
            {t("address_empty")}
          </p>
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
      {managementActionBar}
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
          backHref={returnTo || "/mypage"}
          hideCtaStrip
          showHubQuickActions
        />
      ) : null}
      {embedded ? (
        <div className="mx-auto flex max-w-none flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-0 py-0 pb-2">
            {addressListBody}
          </div>
          {managementActionBar}
        </div>
      ) : (
        pageBodyColumn
      )}

      {embedded ? (
        <AddressEditorSheet
          open={editorOpen}
          mode={editorMode}
          initial={editTarget}
          mapBootstrap={mapBootstrap}
          allAddresses={list}
          onClose={() => {
            setEditorOpen(false);
            setMapBootstrap(null);
          }}
          onSaved={async () => {
            const rows = await commitUserAddressListAfterMutation();
            setList(rows);
          }}
        />
      ) : null}
    </div>
  );
}
