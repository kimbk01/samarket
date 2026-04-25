"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { AddressRowCard } from "@/components/addresses/AddressRowCard";
import { AddressEditorSheet } from "@/components/addresses/AddressEditorSheet";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import {
  consumeMapAddressPick,
  consumeMapAddressPickContext,
  writeMapAddressPickContext,
} from "@/lib/map/map-address-pick-storage";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { ADDR_ADD_CTA, ADDR_LIST_CARD } from "@/lib/ui/address-flow-viber";
import { readCachedMeAddressList, writeCachedMeAddressList } from "@/lib/addresses/address-list-client-cache";

export function AddressManagementClient({ embedded = false }: { embedded?: boolean } = {}) {
  const { tt } = useI18n();
  const pathname = usePathname();
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
  /** `/address/select` 에서 돌아올 때 sessionStorage 픽을 부모가 소비해 시트에 넘김 (시트가 닫힌 채 복귀하면 기존 useEffect(open) 만으로는 픽이 반영되지 않음) */
  const [mapBootstrap, setMapBootstrap] = useState<{
    latitude: number;
    longitude: number;
    fullAddress: string;
    addressDetail?: string | null;
  } | null>(null);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/address/select")) return;
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
          const res = await runSingleFlight("me:addresses:list", () =>
            fetch("/api/me/addresses", { credentials: "include" })
          );
          const j = (await res.json()) as { ok?: boolean; addresses?: UserAddressDTO[] };
          const found = res.ok && j.ok ? j.addresses?.find((a) => a.id === ctx.addressId) : undefined;
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
  }, [pathname, list]);

  const load = useCallback(async () => {
    setLoadErr(null);
    const showWait = listRef.current.length === 0;
    if (showWait) setListBootstrapping(true);
    try {
      const a = await runSingleFlight("me:addresses:list", () =>
        fetch("/api/me/addresses", { credentials: "include" })
      );
      const aj = (await a.json()) as { ok?: boolean; addresses?: UserAddressDTO[]; error?: string };
      if (!a.ok || !aj.ok) {
        setLoadErr(typeof aj.error === "string" ? aj.error : tt("목록을 불러오지 못했어요."));
        return;
      }
      const rows = aj.addresses ?? [];
      setList(rows);
      if (rows.length > 0) writeCachedMeAddressList(rows);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(SAMARKET_ADDRESSES_UPDATED_EVENT));
      }
    } catch {
      setLoadErr(tt("네트워크 오류가 났어요."));
    } finally {
      if (showWait) setListBootstrapping(false);
    }
  }, [tt]);

  useEffect(() => {
    void load();
  }, [load]);

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
    setMapBootstrap(null);
    setEditorMode("create");
    setEditTarget(null);
    writeMapAddressPickContext({ source: "create" });
    if (embedded) {
      router.replace("/mypage/addresses");
    }
    router.push("/address/select");
  }

  function openEdit(row: UserAddressDTO) {
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

  return (
    <div
      className={
        embedded ? "" : "flex min-h-screen w-full min-w-0 max-w-[100dvw] flex-col overflow-x-clip bg-sam-app"
      }
    >
      {!embedded ? (
        <MySubpageHeader title={tt("주소 관리")} backHref="/mypage" hideCtaStrip />
      ) : null}
      {embedded ? (
        <div className="mx-auto max-w-none space-y-4 px-0 py-0 pb-0">
          {loadErr ? (
            <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-3 sam-text-body-secondary text-amber-950">
              {loadErr}
              <p className="mt-2 sam-text-helper text-amber-900/90">
                Supabase에 <code className="rounded bg-sam-surface/60 px-1">user_addresses</code> 마이그레이션을 적용했는지
                확인해 주세요.
              </p>
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
                    onSetAsRepresentative={() => void setAsRepresentative(row.id)}
                    onEdit={() => openEdit(row)}
                    onDelete={() => void removeRow(row.id)}
                  />
                ))}
              </ul>
            )}
          </div>

          <button type="button" onClick={openCreate} className={ADDR_ADD_CTA}>
            {tt("+ 주소 추가")}
          </button>
        </div>
      ) : (
        <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
          <div className="flex min-w-0 flex-col gap-4 py-4">
            {loadErr ? (
              <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-3 sam-text-body-secondary text-amber-950">
                {loadErr}
                <p className="mt-2 sam-text-helper text-amber-900/90">
                  Supabase에 <code className="rounded bg-sam-surface/60 px-1">user_addresses</code> 마이그레이션을 적용했는지
                  확인해 주세요.
                </p>
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
                      onSetAsRepresentative={() => void setAsRepresentative(row.id)}
                      onEdit={() => openEdit(row)}
                      onDelete={() => void removeRow(row.id)}
                    />
                  ))}
                </ul>
              )}
            </div>

            <button type="button" onClick={openCreate} className={ADDR_ADD_CTA}>
              {tt("+ 주소 추가")}
            </button>
          </div>
        </div>
      )}

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
        onSaved={() => void load()}
      />
    </div>
  );
}
