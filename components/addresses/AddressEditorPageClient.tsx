"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AddressEditorSheet } from "@/components/addresses/AddressEditorSheet";
import {
  consumeMapAddressPick,
  consumeMapAddressPickContext,
} from "@/lib/map/map-address-pick-storage";
import {
  describeMeAddressesListFailure,
  fetchMeAddressesListSingleFlight,
} from "@/lib/addresses/address-list-client-cache";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { invalidateAddressDefaultsSnapshotCache } from "@/lib/addresses/fetch-address-defaults-client";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

function AddressEditorPageInner() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const idFromUrl = (sp.get("id") ?? "").trim();
  const mapBootstrapUrl = sp.get("map") === "1";

  const [list, setList] = useState<UserAddressDTO[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editTarget, setEditTarget] = useState<UserAddressDTO | null>(null);
  const [mapBootstrap, setMapBootstrap] = useState<{
    latitude: number;
    longitude: number;
    fullAddress: string;
    addressDetail?: string | null;
  } | null>(null);

  const mapHandledRef = useRef(false);

  useEffect(() => {
    void (async () => {
      setLoadErr(null);
      const result = await fetchMeAddressesListSingleFlight();
      if (!result.ok) {
        setLoadErr(describeMeAddressesListFailure(result, t("address_load_failed")));
        setList([]);
        setBootstrapping(false);
        return;
      }
      const rows = result.rows;
      setList(rows);

      let replaceId = idFromUrl;

      if (mapBootstrapUrl && !mapHandledRef.current) {
        mapHandledRef.current = true;
        const pick = consumeMapAddressPick();
        const ctx = consumeMapAddressPickContext();
        if (pick) {
          setMapBootstrap({
            latitude: pick.latitude,
            longitude: pick.longitude,
            fullAddress: pick.fullAddress,
            addressDetail: pick.addressDetail ?? null,
          });
          if (ctx.source === "edit") {
            const row = rows.find((a) => a.id === ctx.addressId);
            setEditTarget(row ?? null);
            setMode(row ? "edit" : "create");
            if (row) replaceId = row.id;
          } else {
            setMode("create");
            setEditTarget(null);
            replaceId = "";
          }
        }
        const nextPath = replaceId
          ? `/mypage/addresses/edit?id=${encodeURIComponent(replaceId)}`
          : "/mypage/addresses/edit";
        router.replace(nextPath);
      } else if (!mapBootstrapUrl) {
        if (idFromUrl) {
          const row = rows.find((a) => a.id === idFromUrl);
          setEditTarget(row ?? null);
          setMode(row ? "edit" : "create");
        } else {
          setMode("create");
          setEditTarget(null);
        }
      }

      setBootstrapping(false);
    })();
  }, [idFromUrl, mapBootstrapUrl, router]);

  async function reloadList() {
    const result = await fetchMeAddressesListSingleFlight();
    if (result.ok) setList(result.rows);
  }

  if (bootstrapping) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-sam-app sam-text-body-secondary text-sam-muted">
        {t("common_loading")}
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className="flex min-h-screen flex-col bg-sam-app px-4 py-8">
        <p className="text-center sam-text-body-secondary text-sam-danger">{loadErr}</p>
        <button
          type="button"
          className="mx-auto mt-4 rounded-lg border border-sam-border px-4 py-2 sam-text-body font-semibold text-sam-fg"
          onClick={() => router.push("/mypage/addresses")}
        >
          {t("addr_ui_back_to_list")}
        </button>
      </div>
    );
  }

  return (
    <AddressEditorSheet
      layout="page"
      open
      mode={mode}
      initial={editTarget}
      mapBootstrap={mapBootstrap}
      allAddresses={list}
      onClose={() => router.push("/mypage/addresses")}
      onSaved={() => {
        invalidateAddressDefaultsSnapshotCache();
        void reloadList();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(SAMARKET_ADDRESSES_UPDATED_EVENT));
        }
        router.push("/mypage/addresses");
      }}
    />
  );
}

export function AddressEditorPageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center bg-sam-app sam-text-body-secondary text-sam-muted">
          {t("common_loading")}
        </div>
      }
    >
      <AddressEditorPageInner />
    </Suspense>
  );
}
