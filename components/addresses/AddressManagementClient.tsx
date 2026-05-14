"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { AddressRowCard } from "@/components/addresses/AddressRowCard";
import { AddressEditorSheet } from "@/components/addresses/AddressEditorSheet";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import {
  consumeMapAddressPick,
  consumeMapAddressPickContext,
  peekMapAddressPick,
} from "@/lib/map/map-address-pick-storage";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { ADDR_ADD_CTA, ADDR_LIST_CARD } from "@/lib/ui/address-flow-viber";
import {
  describeMeAddressesListFailure,
  fetchMeAddressesListSingleFlight,
  readCachedMeAddressList,
  writeCachedMeAddressList,
} from "@/lib/addresses/address-list-client-cache";
import { invalidateAddressDefaultsSnapshotCache } from "@/lib/addresses/fetch-address-defaults-client";

export function AddressManagementClient({ embedded = false }: { embedded?: boolean } = {}) {
  const { tt } = useI18n();
  const pathname = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const [list, setList] = useState<UserAddressDTO[]>(() => readCachedMeAddressList() ?? []);
  const listRef = useRef<UserAddressDTO[]>([]);
  listRef.current = list;
  const [listBootstrapping, setListBootstrapping] = useState(() => (readCachedMeAddressList()?.length ?? 0) === 0);
  const [loadErr, setLoadErr] = useState<string | null>(null);
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
  const shouldShowMigrationHint =
    !!loadErr &&
    /(user_addresses|relation|schema cache|table_missing|마이그레이션)/i.test(loadErr);

  const returnTo = useMemo(() => {
    const raw = sp?.get("returnTo") ?? "";
    const t = raw.trim();
    if (!t) return "";
    // allow only internal navigation
    if (!t.startsWith("/")) return "";
    if (t.startsWith("//")) return "";
    return t;
  }, [sp]);
  const selectingForReturn = Boolean(returnTo);
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
        router.replace("/mypage/addresses/edit?map=1");
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

  const load = useCallback(async () => {
    setLoadErr(null);
    const showWait = listRef.current.length === 0;
    if (showWait) setListBootstrapping(true);
    try {
      const result = await fetchMeAddressesListSingleFlight();
      if (!result.ok) {
        setLoadErr(describeMeAddressesListFailure(result, tt("목록을 불러오지 못했어요.")));
        return;
      }
      const rows = result.rows;
      setList(rows);
      if (rows.length > 0) writeCachedMeAddressList(rows);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(SAMARKET_ADDRESSES_UPDATED_EVENT));
      }
    } finally {
      if (showWait) setListBootstrapping(false);
    }
  }, [tt]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (linkedStoreIdsInList.length === 0) {
      setApprovedStoresById(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/stores", { credentials: "include" });
        const j = (await res.json()) as { ok?: boolean; stores?: StoreRow[] };
        if (!res.ok || !j.ok || !Array.isArray(j.stores)) return;
        const m = new Map<string, string>();
        for (const store of j.stores) {
          if (store.approval_status !== "approved") continue;
          const id = store.id.trim();
          const name = (store.store_name ?? "").trim();
          if (id) m.set(id, name || id);
        }
        if (!cancelled) setApprovedStoresById(m);
      } catch {
        if (!cancelled) setApprovedStoresById(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [linkedStoreIdsInList]);

  async function removeRow(id: string) {
    if (!confirm(tt("이 주소를 삭제할까요?"))) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/me/addresses/${id}`, { method: "DELETE", credentials: "include" });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        alert(typeof j.error === "string" ? j.error : tt("삭제 실패"));
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function openCreate() {
    if (!embedded) {
      router.push("/mypage/addresses/edit");
      return;
    }
    setMapBootstrap(null);
    setEditorMode("create");
    setEditTarget(null);
    setEditorOpen(true);
  }

  function openEdit(row: UserAddressDTO) {
    if (!embedded) {
      router.push(`/mypage/addresses/edit?id=${encodeURIComponent(row.id)}`);
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
        alert(typeof j.error === "string" ? j.error : tt("대표 주소 설정 실패"));
        return;
      }
      await load();
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
          alert(tt("먼저 주소를 추가해 주세요."));
          return;
        }
        await setAsRepresentative(id);
      }
      invalidateAddressDefaultsSnapshotCache();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(SAMARKET_ADDRESSES_UPDATED_EVENT));
      }
      if (returnTo) {
        router.push(returnTo);
        return;
      }
      router.back();
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div
      className={
        embedded ? "" : "flex min-h-screen w-full min-w-0 max-w-[100dvw] flex-col overflow-x-clip bg-sam-app"
      }
    >
      {!embedded ? (
        <MySubpageHeader
          title={tt("주소 관리")}
          backHref={returnTo || "/mypage"}
          hideCtaStrip
        />
      ) : null}
      {embedded ? (
        <div className="mx-auto max-w-none space-y-4 px-0 py-0 pb-0">
          {loadErr ? (
            <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-3 sam-text-body-secondary text-amber-950">
              {loadErr === "user_addresses_table_missing"
                ? "주소 테이블(user_addresses)이 없습니다."
                : loadErr}
              {shouldShowMigrationHint ? (
                <p className="mt-2 sam-text-helper text-amber-900/90">
                  Supabase에 <code className="rounded bg-sam-surface/60 px-1">user_addresses</code> 마이그레이션을 적용했는지
                  확인해 주세요.
                </p>
              ) : null}
            </div>
          ) : null}

          <div>
            {list.length === 0 && !loadErr && listBootstrapping ? (
              <p className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface py-8 text-center sam-text-body-secondary text-sam-muted">
                불러오는 중…
              </p>
            ) : list.length === 0 && !loadErr ? (
              <p className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface py-8 text-center sam-text-body-secondary text-sam-muted">
                {tt("등록된 주소가 없어요. 아래에서 추가해 주세요.")}
              </p>
            ) : (
              <ul className={`divide-y divide-sam-primary-border/35 ${ADDR_LIST_CARD}`}>
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

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirming || (selectingForReturn && list.length > 0 && !pickedId)}
              className="w-full rounded-ui-rect bg-signature py-3.5 sam-text-body font-semibold text-white disabled:opacity-50"
            >
              {confirming ? tt("처리 중…") : tt("확인")}
            </button>
            <button type="button" onClick={openCreate} className={ADDR_ADD_CTA}>
              {tt("+ 주소 추가")}
            </button>
          </div>
        </div>
      ) : (
        <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
          <div className="flex min-w-0 flex-col gap-4 py-4">
            {loadErr ? (
              <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-3 sam-text-body-secondary text-amber-950">
                {loadErr === "user_addresses_table_missing"
                  ? "주소 테이블(user_addresses)이 없습니다."
                  : loadErr}
                {shouldShowMigrationHint ? (
                  <p className="mt-2 sam-text-helper text-amber-900/90">
                    Supabase에 <code className="rounded bg-sam-surface/60 px-1">user_addresses</code> 마이그레이션을 적용했는지
                    확인해 주세요.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div>
              {list.length === 0 && !loadErr && listBootstrapping ? (
                <p className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface py-8 text-center sam-text-body-secondary text-sam-muted">
                  불러오는 중…
                </p>
              ) : list.length === 0 && !loadErr ? (
                <p className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface py-8 text-center sam-text-body-secondary text-sam-muted">
                  {tt("등록된 주소가 없어요. 아래에서 추가해 주세요.")}
                </p>
              ) : (
                <ul className={`divide-y divide-sam-primary-border/35 ${ADDR_LIST_CARD}`}>
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

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming || (selectingForReturn && list.length > 0 && !pickedId)}
                className="w-full rounded-ui-rect bg-signature py-3.5 sam-text-body font-semibold text-white disabled:opacity-50"
              >
                {confirming ? tt("처리 중…") : tt("확인")}
              </button>
              <button type="button" onClick={openCreate} className={ADDR_ADD_CTA}>
                {tt("+ 주소 추가")}
              </button>
            </div>
          </div>
        </div>
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
          onSaved={() => {
            invalidateAddressDefaultsSnapshotCache();
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
