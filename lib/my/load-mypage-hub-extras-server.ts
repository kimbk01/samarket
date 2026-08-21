import type { AddressDefaultsFlags } from "@/lib/my/address-defaults-types";
import type { LifeDefaultLocationSummary } from "@/lib/addresses/life-default-location-summary";
import { getUserAddressDefaults } from "@/lib/addresses/user-address-service";
import type { MyPageOverviewCounts } from "@/components/mypage/types";
import { applyBuyerAutoConfirmAllDue } from "@/lib/trade/apply-buyer-auto-confirm";
import {
  countSalesHistoryItems,
  loadPurchaseHistoryRows,
  loadSalesHistoryRows,
} from "@/lib/mypage/trade-history-load-server";
import { loadMeStoresListForUser } from "@/lib/me/load-me-stores-for-user";
import { getOwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { fetchOwnerStoreOrderCounts } from "@/lib/stores/fetch-owner-store-order-counts";
import { getCachedStoreOrderCounts } from "@/lib/stores/store-order-counts-cache";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { MypageHubServerExtras } from "@/lib/my/types";

async function loadTradeCountsForHub(userId: string): Promise<Pick<MyPageOverviewCounts, "purchases" | "sales">> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return { purchases: null, sales: null };
  }
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;
  /** 스윕 비차단 — 허브 배지 조회 지연 방지 */
  void applyBuyerAutoConfirmAllDue(sbAny).catch(() => {});
  const purchaseLoad = await loadPurchaseHistoryRows(sbAny, userId, { forCount: true });
  const salesLoad = await loadSalesHistoryRows(sbAny, userId, { forCount: true });
  const purchaseCount = purchaseLoad.rows.length;
  const salesCount = countSalesHistoryItems(salesLoad.rows, salesLoad.sellingPostIds);
  return { purchases: purchaseCount, sales: salesCount };
}

/** RSC for /mypage: hub badges on server (fewer client GETs on mount). */
export async function loadMypageHubExtrasServer(
  userId: string,
  hasOwnerStore: boolean
): Promise<MypageHubServerExtras> {
  const uid = userId.trim();
  if (!uid) {
    return {
      addressDefaults: null,
      neighborhoodFromLife: null,
      overviewCounts: { purchases: null, sales: null, storeAttention: null },
      ownerHubStoreId: null,
      ownerStoreGate: null,
      ownerStoreGateFirstId: null,
    };
  }

  const sbStores = tryGetSupabaseForStores();

  const addressPromise: Promise<{
    addressDefaults: AddressDefaultsFlags;
    neighborhoodFromLife: LifeDefaultLocationSummary | null;
  }> =
    sbStores
      ? getUserAddressDefaults(sbStores, uid)
          .then((defaults) => ({
            addressDefaults: {
              master: defaults.master != null,
              life: false,
              trade: false,
              delivery: false,
            },
            neighborhoodFromLife: null,
          }))
          .catch(() => ({
            addressDefaults: null,
            neighborhoodFromLife: null,
          }))
      : Promise.resolve({ addressDefaults: null, neighborhoodFromLife: null });

  const tradePromise = loadTradeCountsForHub(uid);

  const storesPromise =
    hasOwnerStore && sbStores ? loadMeStoresListForUser(sbStores, uid) : Promise.resolve({ ok: true as const, stores: [] });

  const [addr, trade, storesResult] = await Promise.all([addressPromise, tradePromise, storesPromise]);

  let ownerHubStoreId: string | null = null;
  let ownerStoreGate: MypageHubServerExtras["ownerStoreGate"] = null;
  let ownerStoreGateFirstId: string | null = null;
  let storeAttention: number | null = null;

  if (!hasOwnerStore) {
    ownerStoreGate = getOwnerStoreGateState([]);
    ownerStoreGateFirstId = null;
  } else if (hasOwnerStore && storesResult.ok && sbStores) {
    const list = storesResult.stores;
    if (list.length === 0) {
      ownerStoreGate = getOwnerStoreGateState([]);
      ownerStoreGateFirstId = null;
    } else {
      const forGate = list.map((s) => ({
        id: s.id,
        approval_status: String(s.approval_status ?? ""),
        rejected_reason: s.rejected_reason ?? null,
        revision_note: s.revision_note ?? null,
      }));
      ownerStoreGate = getOwnerStoreGateState(forGate);
      const approvedId =
        list.find((s) => String(s.approval_status ?? "") === "approved")?.id?.trim() ?? null;
      ownerStoreGateFirstId =
        ownerStoreGate.kind === "approved"
          ? approvedId || list[0]?.id?.trim() || null
          : list[0]?.id?.trim() || null;

      const targetStore =
        list.find(
          (store) =>
            String(store.approval_status) === "approved" &&
            store.is_visible === true &&
            store.sales_permission?.allowed_to_sell === true &&
            String(store.sales_permission?.sales_status ?? "") === "approved",
        ) ?? list[0];

      if (targetStore?.id) {
        const hubId = targetStore.id.trim();
        ownerHubStoreId = hubId || null;
        if (hubId) {
          try {
            const { payload } = await getCachedStoreOrderCounts(hubId, async () => {
              const counts = await fetchOwnerStoreOrderCounts(sbStores, hubId);
              return { payload: { ok: true as const, ...counts }, via: "rpc" };
            });
            const refund = Math.max(0, Math.floor(Number(payload.refund_requested_count) || 0));
            const pending = Math.max(0, Math.floor(Number(payload.pending_accept_count) || 0));
            storeAttention = refund + pending;
          } catch {
            storeAttention = null;
          }
        }
      }
    }
  } else if (hasOwnerStore && storesResult.ok === false) {
    ownerStoreGate = null;
    ownerStoreGateFirstId = null;
  }

  return {
    addressDefaults: addr.addressDefaults,
    neighborhoodFromLife: addr.neighborhoodFromLife,
    overviewCounts: {
      purchases: trade.purchases,
      sales: trade.sales,
      storeAttention,
    },
    ownerHubStoreId,
    ownerStoreGate,
    ownerStoreGateFirstId,
  };
}
