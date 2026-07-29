"use client";

/**
 * Section / console routes only — NOT `/mypage` root.
 * Root uses `useMypageHomeModel` (no trade-counts / CMS / PII localStorage).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getMyPageData } from "@/lib/my/getMyPageData";
import type { MyPageData } from "@/lib/my/types";
import type { AddressDefaultsFlags } from "@/lib/my/address-defaults-types";
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
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { fetchAddressDefaultsSnapshot, seedAddressDefaultsSnapshotCache } from "@/lib/addresses/fetch-address-defaults-client";
import { useAddressDefaultsBootRetry } from "@/lib/addresses/use-address-defaults-boot-retry";
import { primeMeProfileDedupedFromKnownProfile } from "@/lib/profile/fetch-me-profile-deduped";
import type { ProfileRow } from "@/lib/profile/types";
import { clearMypageHomeCaches } from "@/lib/mypage/mypage-home-snapshot";

function hasCompleteOverviewCounts(
  counts: MyPageOverviewCounts,
  hasOwnerStore: boolean,
): boolean {
  if (typeof counts.purchases !== "number" || typeof counts.sales !== "number") return false;
  if (hasOwnerStore && counts.storeAttention === null) return false;
  return true;
}

function primeProfileDedupeFromRow(profile: ProfileRow | null | undefined): void {
  if (!profile?.id?.trim()) return;
  primeMeProfileDedupedFromKnownProfile(profile);
}

export type UseMypageHubModelOptions = {
  enabled?: boolean;
};

export function useMypageHubModel(
  initialMyPageData: MyPageData | null | undefined,
  options: UseMypageHubModelOptions = {},
) {
  const enabled = options.enabled !== false;
  const hub0 = initialMyPageData?.hubServerExtras;
  const [data, setData] = useState<MyPageData | null>(() =>
    initialMyPageData !== undefined ? initialMyPageData : null,
  );
  const [loading, setLoading] = useState(() =>
    initialMyPageData === undefined ? true : initialMyPageData == null,
  );
  const [overviewCounts, setOverviewCounts] = useState<MyPageOverviewCounts>(() => {
    if (hub0) return { ...hub0.overviewCounts };
    return { purchases: null, sales: null, storeAttention: null };
  });
  const [ownerHubStoreId, setOwnerHubStoreId] = useState<string | null>(
    () => hub0?.ownerHubStoreId ?? null,
  );
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
  const skipInitialAddressFetchRef = useRef(Boolean(hub0 || initialMyPageData?.addressDefaultsSnapshot));
  const skipInitialCountsFetchRef = useRef(Boolean(hub0));
  const initialLoadRequestedRef = useRef(false);
  const addressDefaultsRef = useRef(addressDefaults);
  const neighborhoodFromLifeRef = useRef(neighborhoodFromLife);
  const loadGenRef = useRef(0);

  useEffect(() => {
    /* purge legacy full MyPageData PII caches */
    clearMypageHomeCaches();
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean; force?: boolean }) => {
      const silent = opts?.silent === true;
      const force = opts?.force === true;
      const shouldToggleLoading = !silent || data == null;
      if (shouldToggleLoading) setLoading(true);
      const gen = ++loadGenRef.current;
      try {
        if (!force && data?.profile) {
          primeProfileDedupeFromRow(data.profile);
        }
        const d = await getMyPageData();
        if (gen !== loadGenRef.current) return;
        setData(d);
      } finally {
        if (gen === loadGenRef.current && shouldToggleLoading) setLoading(false);
      }
    },
    [data],
  );

  const loadAddressDefaults = useCallback(async (opts?: { force?: boolean }) => {
    try {
      const snapshot = await fetchAddressDefaultsSnapshot({ force: opts?.force === true });
      if (snapshot?.ok && snapshot.defaults) {
        setAddressDefaults({
          master: snapshot.defaults.master != null,
          life: snapshot.defaults.life != null,
          trade: snapshot.defaults.trade != null,
          delivery: snapshot.defaults.delivery != null,
        });
        const n = snapshot.neighborhoodFromLife;
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
    addressDefaultsRef.current = addressDefaults;
  }, [addressDefaults]);

  useEffect(() => {
    neighborhoodFromLifeRef.current = neighborhoodFromLife;
  }, [neighborhoodFromLife]);

  useAddressDefaultsBootRetry(
    () => void loadAddressDefaults({ force: true }),
    () => {
      const uid = getCurrentUser()?.id?.trim();
      if (!uid) return false;
      return addressDefaultsRef.current == null && neighborhoodFromLifeRef.current == null;
    },
  );

  useLayoutEffect(() => {
    primeProfileDedupeFromRow(initialMyPageData?.profile ?? data?.profile ?? null);
    const hub = initialMyPageData?.hubServerExtras;
    const profileId = (initialMyPageData?.profile ?? data?.profile)?.id?.trim();
    if (hub && profileId) {
      primeTradeHistoryCountsCache(profileId, {
        purchaseCount: hub.overviewCounts.purchases ?? 0,
        salesCount: hub.overviewCounts.sales ?? 0,
      });
    }
  }, [initialMyPageData?.profile?.id, data?.profile?.id, initialMyPageData?.hubServerExtras]);

  useEffect(() => {
    if (!enabled) {
      initialLoadRequestedRef.current = false;
      return;
    }
    if (initialLoadRequestedRef.current) return;
    initialLoadRequestedRef.current = true;
    if (initialMyPageData?.profile) {
      void load({ silent: true });
      return;
    }
    void load();
  }, [enabled, load, initialMyPageData?.profile]);

  useLayoutEffect(() => {
    const snap = initialMyPageData?.addressDefaultsSnapshot;
    if (!snap?.ok || !snap.defaults) return;
    seedAddressDefaultsSnapshotCache(snap);
    setAddressDefaults({
      master: snap.defaults.master != null,
      life: snap.defaults.life != null,
      trade: snap.defaults.trade != null,
      delivery: snap.defaults.delivery != null,
    });
    const n = snap.neighborhoodFromLife;
    setNeighborhoodFromLife(
      n && typeof n === "object" && typeof n.complete === "boolean" && typeof n.label === "string"
        ? n
        : null,
    );
    skipInitialAddressFetchRef.current = true;
  }, [initialMyPageData?.addressDefaultsSnapshot]);

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
    if (!data?.profile?.id) return;
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
  }, [data?.profile?.id]);

  const loadAddressDefaultsRef = useRef(loadAddressDefaults);

  useEffect(() => {
    loadAddressDefaultsRef.current = loadAddressDefaults;
  }, [loadAddressDefaults]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const onProfileUpdated = () => {
      void load({ silent: true, force: true });
      void loadAddressDefaultsRef.current({ force: true });
    };
    const onAddressesUpdated = () => {
      void loadAddressDefaultsRef.current({ force: true });
    };
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
      window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    };
  }, [enabled, load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      const uid = getCurrentUser()?.id?.trim();
      if (!uid) return;
      if (addressDefaultsRef.current != null && neighborhoodFromLifeRef.current != null) return;
      void loadAddressDefaultsRef.current();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

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
        let gateFirstId: string | null = null;
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
              gateFirstId = list[0]?.id?.trim() ?? null;
              setOwnerStoreGate(getOwnerStoreGateState(forGate));
              setOwnerStoreGateFirstId(gateFirstId);
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
          const nextOverview: MyPageOverviewCounts = {
            purchases: purchaseCount,
            sales: salesCount,
            storeAttention,
          };
          setOwnerHubStoreId(hubStoreId);
          setOverviewCounts(nextOverview);
          void hasCompleteOverviewCounts(nextOverview, hasOwnerStoreFlag);
        }
      } catch {
        if (!cancelled) {
          setOwnerHubStoreId(null);
          setOwnerStoreGate(null);
          setOwnerStoreGateFirstId(null);
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
