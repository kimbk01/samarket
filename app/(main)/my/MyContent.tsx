"use client";

import { useCallback, useEffect, useState } from "react";
import { getMyPageData } from "@/lib/my/getMyPageData";
import type { MyPageData } from "@/lib/my/types";
import type { AddressDefaultsFlags } from "@/components/my/MyProfileCard";
import { MyPageHeader } from "@/components/my/MyPageHeader";
import { MyTopBanner } from "@/components/my/MyTopBanner";
import { MypageInstagramView } from "@/components/my/mypage/MypageInstagramView";
import { useMyFavoriteCount } from "@/hooks/useMyFavoriteCount";
import { useMyNotificationUnreadCount } from "@/hooks/useMyNotificationUnreadCount";
import { fetchTradeHistoryCounts } from "@/lib/mypage/trade-history-client";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { fetchStoreOrderCountsDeduped } from "@/lib/business/fetch-store-order-counts-deduped";
import { PROFILE_UPDATED_EVENT } from "@/lib/profile/profile-update-events";
import type { OwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { getOwnerStoreGateState } from "@/lib/stores/store-admin-access";

type OverviewCounts = {
  purchases: number | null;
  sales: number | null;
  storeAttention: number | null;
};

export function MyContent() {
  const [data, setData] = useState<MyPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [overviewCounts, setOverviewCounts] = useState<OverviewCounts>({
    purchases: null,
    sales: null,
    storeAttention: null,
  });
  /** 매장 CTA(주문·문의 등)에 넣을 대표 매장 id — 허브와 동일 우선순위 */
  const [ownerHubStoreId, setOwnerHubStoreId] = useState<string | null>(null);
  /** 심사 중·반려 등 — 매장 진입 시 모달 안내용 */
  const [ownerStoreGate, setOwnerStoreGate] = useState<OwnerStoreGateState | null>(null);
  const [ownerStoreGateFirstId, setOwnerStoreGateFirstId] = useState<string | null>(null);
  const [addressDefaults, setAddressDefaults] = useState<AddressDefaultsFlags>(null);
  const { count: favoriteCount } = useMyFavoriteCount();
  const notificationUnreadCount = useMyNotificationUnreadCount();

  const load = useCallback(async () => {
    setLoading(true);
    const d = await getMyPageData();
    setData(d);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onProfileUpdated = () => {
      void load();
    };
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void load();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [load]);

  const viewerId = data?.profile?.id?.trim() ?? "";
  const hasOwnerStoreFlag = data?.hasOwnerStore ?? false;

  useEffect(() => {
    if (!viewerId) {
      setAddressDefaults(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/address-defaults", { credentials: "include" });
        const json = (await res.json()) as {
          ok?: boolean;
          defaults?: { life?: unknown; trade?: unknown; delivery?: unknown };
        };
        if (cancelled) return;
        if (res.ok && json.ok && json.defaults) {
          setAddressDefaults({
            life: json.defaults.life != null,
            trade: json.defaults.trade != null,
            delivery: json.defaults.delivery != null,
          });
        } else {
          setAddressDefaults(null);
        }
      } catch {
        if (!cancelled) setAddressDefaults(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewerId]);

  useEffect(() => {
    if (!viewerId) {
      setOwnerHubStoreId(null);
      setOwnerStoreGate(null);
      setOwnerStoreGateFirstId(null);
      setOverviewCounts({ purchases: null, sales: null, storeAttention: null });
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
                  String(store.sales_permission?.sales_status ?? "") === "approved"
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

  const headerCenterTitle =
    data?.profile?.nickname?.trim() ||
    data?.profile?.email?.split("@")[0] ||
    null;

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <MyPageHeader notificationUnreadCount={notificationUnreadCount} />
        <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
          <div className="rounded-2xl border border-ig-border bg-[var(--sub-bg)] px-4 py-10 text-center text-[14px] text-[var(--text-muted)]">
            내정보를 불러오는 중이에요.
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background">
        <MyPageHeader notificationUnreadCount={notificationUnreadCount} />
        <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
          <div className="rounded-2xl border border-ig-border bg-[var(--sub-bg)] px-4 py-10 text-center text-[14px] text-[var(--text-muted)]">
            로그인이 필요합니다.
          </div>
        </div>
      </div>
    );
  }

  const {
    profile,
    banner,
    bannerHidden,
    services,
    mannerScore,
    isBusinessMember,
    isAdmin,
    hasOwnerStore,
  } = data;
  const showBanner = banner && !bannerHidden;

  const favoriteBadge =
    favoriteCount != null && favoriteCount > 0 ? `${favoriteCount > 99 ? "99+" : favoriteCount}` : null;
  const notificationBadge =
    notificationUnreadCount != null && notificationUnreadCount > 0
      ? `${notificationUnreadCount > 99 ? "99+" : notificationUnreadCount}`
      : null;

  const storeAttentionSummary =
    hasOwnerStore && overviewCounts.storeAttention != null
      ? `처리 ${overviewCounts.storeAttention}건`
      : hasOwnerStore
        ? "새 주문·문의 확인"
        : null;

  return (
    <div className="min-h-screen bg-background pb-8">
      <MyPageHeader notificationUnreadCount={notificationUnreadCount} centerTitle={headerCenterTitle} />
      <div className="mx-auto max-w-lg">
        {showBanner ? (
          <div className="px-4 pt-4">
            <MyTopBanner banner={banner} onDismiss={load} />
          </div>
        ) : null}

        {profile ? (
          <MypageInstagramView
            profile={profile}
            mannerScore={mannerScore}
            isBusinessMember={isBusinessMember}
            hasOwnerStore={hasOwnerStore}
            ownerHubStoreId={ownerHubStoreId}
            ownerStoreGate={ownerStoreGate}
            ownerStoreGateFirstId={ownerStoreGateFirstId}
            isAdmin={isAdmin}
            addressDefaults={addressDefaults}
            overviewCounts={overviewCounts}
            favoriteBadge={favoriteBadge}
            notificationBadge={notificationBadge}
            storeAttentionSummary={storeAttentionSummary}
            services={services}
          />
        ) : (
          <div className="mx-4 mt-4 rounded-2xl border border-ig-border bg-[var(--sub-bg)] px-4 py-10 text-center text-[14px] text-[var(--text-muted)]">
            프로필을 불러오지 못했어요. 다시 로그인해 주세요.
          </div>
        )}
      </div>
    </div>
  );
}
