"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getMyPageData } from "@/lib/my/getMyPageData";
import type { MyPageData } from "@/lib/my/types";
import type { AddressDefaultsFlags } from "@/components/my/MyProfileCard";
import type { LifeDefaultLocationSummary } from "@/lib/addresses/life-default-location-summary";
import type { MyPageOverviewCounts } from "@/components/mypage/types";
import {
  fetchTradeHistoryCounts,
  primeTradeHistoryCountsCache,
} from "@/lib/mypage/trade-history-client";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { fetchStoreOrderCountsDeduped } from "@/lib/business/fetch-store-order-counts-deduped";
import { PROFILE_UPDATED_EVENT } from "@/lib/profile/profile-update-events";
import type { OwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { getOwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  getUserSettings,
  subscribeUserSettings,
  syncUserSettings,
} from "@/lib/settings/user-settings-store";

export function useMypageHubModel(initialMyPageData: MyPageData | null | undefined) {
  const hub0 = initialMyPageData?.hubServerExtras;
  const [data, setData] = useState<MyPageData | null>(() =>
    initialMyPageData !== undefined ? initialMyPageData : null,
  );
  const [loading, setLoading] = useState(() => initialMyPageData === undefined);
  const [overviewCounts, setOverviewCounts] = useState<MyPageOverviewCounts>(() =>
    hub0
      ? { ...hub0.overviewCounts }
      : { purchases: null, sales: null, storeAttention: null },
  );
  const [ownerHubStoreId, setOwnerHubStoreId] = useState<string | null>(() => hub0?.ownerHubStoreId ?? null);
  const [ownerStoreGate, setOwnerStoreGate] = useState<OwnerStoreGateState | null>(
    () => hub0?.ownerStoreGate ?? null,
  );
  const [ownerStoreGateFirstId, setOwnerStoreGateFirstId] = useState<string | null>(
    () => hub0?.ownerStoreGateFirstId ?? null,
  );
  const [addressDefaults, setAddressDefaults] = useState<AddressDefaultsFlags>(() => hub0?.addressDefaults ?? null);
  const [neighborhoodFromLife, setNeighborhoodFromLife] = useState<LifeDefaultLocationSummary | null>(
    () => hub0?.neighborhoodFromLife ?? null,
  );
  const skipInitialAddressFetchRef = useRef(Boolean(hub0));
  const skipInitialCountsFetchRef = useRef(Boolean(hub0));
  const load = useCallback(async () => {
    setLoading(true);
    const d = await getMyPageData();
    setData(d);
    setLoading(false);
  }, []);

  const loadAddressDefaults = useCallback(async () => {
    try {
      const res = await fetch("/api/me/address-defaults", { credentials: "include" });
      const json = (await res.json()) as {
        ok?: boolean;
        defaults?: { life?: unknown; trade?: unknown; delivery?: unknown };
        neighborhoodFromLife?: LifeDefaultLocationSummary;
      };
      if (res.ok && json.ok && json.defaults) {
        setAddressDefaults({
          life: json.defaults.life != null,
          trade: json.defaults.trade != null,
          delivery: json.defaults.delivery != null,
        });
        const n = json.neighborhoodFromLife;
        setNeighborhoodFromLife(
          n && typeof n === "object" && typeof n.complete === "boolean" && typeof n.label === "string"
            ? n
            : null,
        );
      } else {
        setAddressDefaults(null);
        setNeighborhoodFromLife(null);
      }
    } catch {
      setAddressDefaults(null);
      setNeighborhoodFromLife(null);
    }
  }, []);

  useEffect(() => {
    if (initialMyPageData !== undefined) return;
    void load();
  }, [load, initialMyPageData]);

  useLayoutEffect(() => {
    const x = initialMyPageData?.hubServerExtras;
    const uid = data?.profile?.id?.trim();
    if (!x || !uid) return;
    const p = x.overviewCounts.purchases;
    const s = x.overviewCounts.sales;
    if (typeof p === "number" && typeof s === "number") {
      primeTradeHistoryCountsCache(uid, { purchaseCount: p, salesCount: s });
    }
  }, [initialMyPageData?.hubServerExtras, data?.profile?.id]);

  useEffect(() => {
    if (initialMyPageData === undefined || !data?.profile?.id) return;
    const uid = data.profile.id.trim();
    if (!uid) return;
    const applyHidden = () => {
      const hidden = getUserSettings(uid).app_banner_hidden === true;
      setData((prev) => (prev && hidden !== prev.bannerHidden ? { ...prev, bannerHidden: hidden } : prev));
    };
    applyHidden();
    void syncUserSettings(uid).then(() => applyHidden());
    return subscribeUserSettings(({ userId, settings }) => {
      if (userId === uid && typeof settings.app_banner_hidden === "boolean") {
        applyHidden();
      }
    });
  }, [initialMyPageData, data?.profile?.id]);

  const loadAddressDefaultsRef = useRef(loadAddressDefaults);

  useEffect(() => {
    loadAddressDefaultsRef.current = loadAddressDefaults;
  }, [loadAddressDefaults]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onProfileUpdated = () => {
      void load();
      void loadAddressDefaultsRef.current();
    };
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        void load();
        if (getCurrentUser()?.id?.trim()) void loadAddressDefaultsRef.current();
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [load]);

  const viewerId = data?.profile?.id?.trim() ?? "";
  const hasOwnerStoreFlag = data?.hasOwnerStore ?? false;

  useEffect(() => {
    if (!viewerId) {
      setAddressDefaults(null);
      setNeighborhoodFromLife(null);
      skipInitialAddressFetchRef.current = false;
      return;
    }
    if (skipInitialAddressFetchRef.current) {
      skipInitialAddressFetchRef.current = false;
      return;
    }
    void loadAddressDefaults();
  }, [viewerId, loadAddressDefaults]);

  useEffect(() => {
    if (!viewerId) {
      setOwnerHubStoreId(null);
      setOwnerStoreGate(null);
      setOwnerStoreGateFirstId(null);
      setOverviewCounts({ purchases: null, sales: null, storeAttention: null });
      skipInitialCountsFetchRef.current = false;
      return;
    }

    if (skipInitialCountsFetchRef.current) {
      skipInitialCountsFetchRef.current = false;
      return;
    }

    let cancelled = false;

    const loadCounts = async () => {
      try {
        const [tradeResult, storesPacket] = await Promise.all([
          fetchTradeHistoryCounts(viewerId),
          hasOwnerStoreFlag ? fetchMeStoresListDeduped() : Promise.resolve(null),
        ]);
        const { purchaseCount, salesCount } = tradeResult;

        let storeAttention: number | null = null;
        let hubStoreId: string | null = null;
        if (hasOwnerStoreFlag && storesPacket) {
          const { status, json: rawStores } = storesPacket;
          const storesJson = rawStores as {
            ok?: boolean;
            stores?: Array<{
              id: string;
              approval_status?: string | null;
              rejected_reason?: string | null;
              revision_note?: string | null;
              is_visible?: boolean | null;
              sales_permission?: {
                allowed_to_sell?: boolean;
                sales_status?: string | null;
              } | null;
            }>;
          };

          if (status !== 401 && storesJson.ok && Array.isArray(storesJson.stores)) {
            const list = storesJson.stores;
            if (!cancelled) {
              const forGate = list.map((s) => ({
                id: s.id,
                approval_status: String(s.approval_status ?? ""),
                rejected_reason: s.rejected_reason ?? null,
                revision_note: s.revision_note ?? null,
              }));
              setOwnerStoreGate(getOwnerStoreGateState(forGate));
              setOwnerStoreGateFirstId(list[0]?.id?.trim() ?? null);
            }

            const targetStore =
              list.find(
                (store) =>
                  String(store.approval_status) === "approved" &&
                  store.is_visible === true &&
                  store.sales_permission?.allowed_to_sell === true &&
                  String(store.sales_permission?.sales_status ?? "") === "approved",
              ) ?? list[0];

            if (targetStore?.id) {
              hubStoreId = targetStore.id.trim() || null;
              const { json: rawCounts } = await fetchStoreOrderCountsDeduped(targetStore.id);
              const countsJson = rawCounts as {
                ok?: boolean;
                refund_requested_count?: unknown;
                pending_accept_count?: unknown;
              };
              if (countsJson.ok) {
                const refund = Math.max(0, Math.floor(Number(countsJson.refund_requested_count) || 0));
                const pending = Math.max(0, Math.floor(Number(countsJson.pending_accept_count) || 0));
                storeAttention = refund + pending;
              }
            }
          } else if (!cancelled) {
            setOwnerStoreGate(null);
            setOwnerStoreGateFirstId(null);
          }
        } else if (!cancelled) {
          setOwnerStoreGate(null);
          setOwnerStoreGateFirstId(null);
        }

        if (!cancelled) {
          setOwnerHubStoreId(hubStoreId);
          setOverviewCounts({
            purchases: purchaseCount,
            sales: salesCount,
            storeAttention,
          });
        }
      } catch {
        if (!cancelled) {
          setOwnerHubStoreId(null);
          setOwnerStoreGate(null);
          setOwnerStoreGateFirstId(null);
          setOverviewCounts((prev) => ({
            purchases: prev.purchases,
            sales: prev.sales,
            storeAttention: prev.storeAttention,
          }));
        }
      }
    };

    void loadCounts();

    return () => {
      cancelled = true;
    };
  }, [viewerId, hasOwnerStoreFlag]);

  return {
    data,
    setData,
    loading,
    load,
    overviewCounts,
    ownerHubStoreId,
    ownerStoreGate,
    ownerStoreGateFirstId,
    addressDefaults,
    neighborhoodFromLife,
  };
}
