"use client";

import { useCallback, useEffect, useState } from "react";
import { useCustomerStoreOrderRowRealtime } from "@/hooks/delivery-customer/useCustomerStoreOrderRowRealtime";
import { useOwnerStoreOrderRowRealtime } from "@/hooks/delivery-owner/useOwnerStoreOrderRowRealtime";
import type {
  StoreOrderBuyerItemPayload,
  StoreOrderBuyerOrderPayload,
} from "@/components/chats/StoreOrderBuyerChatTop";
import type { OwnerDeliveryOrderRef } from "@/components/business/owner/OwnerStoreOrderDeliveryActions";
import { fetchMeStoreOrderDetailDeduped } from "@/lib/stores/store-delivery-api-client";
import { formatStorePickupAddressLines } from "@/lib/stores/store-location-label";
import {
  buildStoreOrderChatCardView,
  type StoreOrderChatCardView,
} from "@/lib/store-order-chat/build-store-order-chat-card-view";

export type StoreOrderRoomSnapshot = {
  buyerOrder: StoreOrderBuyerOrderPayload | null;
  buyerItems: StoreOrderBuyerItemPayload[];
  ownerOrder: OwnerDeliveryOrderRef | null;
  orderNo: string;
  orderCard: StoreOrderChatCardView | null;
  /** 구매자 헤더·카드용 매장 프로필 이미지 */
  storeProfileImageUrl: string | null;
  /** 구매자 뒤로가기 browse 목록 (`resolveStoreBrowseListHref`) */
  storeSlug: string | null;
  storeBusinessType: string | null;
  storeCategorySlug: string | null;
};

function mapBuyerOrder(raw: Record<string, unknown>, storeName: string): StoreOrderBuyerOrderPayload {
  const ft = String(raw.fulfillment_type ?? "").trim();
  const storePickup =
    ft === "pickup" && raw.store
      ? formatStorePickupAddressLines(raw.store as Record<string, unknown>)
      : undefined;
  return {
    order_no: String(raw.order_no ?? ""),
    order_status: String(raw.order_status ?? ""),
    payment_status: String(raw.payment_status ?? ""),
    store_name: storeName,
    fulfillment_type: ft,
    store_pickup_address_lines: storePickup,
    delivery_address_summary:
      typeof raw.delivery_address_summary === "string" ? raw.delivery_address_summary : null,
    delivery_address_detail:
      typeof raw.delivery_address_detail === "string" ? raw.delivery_address_detail : null,
    buyer_phone: typeof raw.buyer_phone === "string" ? raw.buyer_phone : null,
    buyer_note: typeof raw.buyer_note === "string" ? raw.buyer_note : null,
    payment_amount: Number(raw.payment_amount ?? raw.total_amount ?? 0) || 0,
    discount_amount:
      raw.discount_amount != null ? Number(raw.discount_amount) : null,
    delivery_fee_amount:
      raw.delivery_fee_amount != null ? Number(raw.delivery_fee_amount) : null,
    buyer_payment_method:
      typeof raw.buyer_payment_method === "string" ? raw.buyer_payment_method : null,
    buyer_payment_method_detail:
      typeof raw.buyer_payment_method_detail === "string" ? raw.buyer_payment_method_detail : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : null,
    accepted_at: typeof raw.accepted_at === "string" ? raw.accepted_at : null,
    estimated_prep_minutes:
      raw.estimated_prep_minutes != null ? Number(raw.estimated_prep_minutes) : null,
    estimated_ready_at:
      typeof raw.estimated_ready_at === "string" ? raw.estimated_ready_at : null,
  };
}

async function fetchOrderEvents(orderId: string): Promise<Array<{ to_status?: string | null; created_at?: string | null }>> {
  try {
    const res = await fetch(`/api/me/store-orders/${encodeURIComponent(orderId)}/events`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      events?: Array<{ to_status?: string | null; created_at?: string | null }>;
    };
    return json?.ok && Array.isArray(json.events) ? json.events : [];
  } catch {
    return [];
  }
}

export function useStoreOrderRoomSnapshot(input: {
  storeOrderId: string;
  storeId: string;
  /** 기존 방 participant role 이 member 로 남은 경우가 있어, storeId 가 있으면 오너 API를 먼저 확인한다. */
  isOwner: boolean;
  enabled: boolean;
}): {
  snapshot: StoreOrderRoomSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [snapshot, setSnapshot] = useState<StoreOrderRoomSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const orderId = input.storeOrderId.trim();
    const storeId = input.storeId.trim();
    if (!input.enabled || !orderId) return;
    setLoading(true);
    setError(null);
    try {
      if (input.isOwner && storeId) {
        const [res, events] = await Promise.all([
          fetch(`/api/me/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetchOrderEvents(orderId),
        ]);
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          order?: Record<string, unknown> & { items?: Array<Record<string, unknown>> };
          meta?: { store_name?: string; store_pickup_address_lines?: string[] };
        };
        if (!json?.ok || !json.order) {
          const ownerRejected =
            res.status === 401 ||
            res.status === 403 ||
            res.status === 404 ||
            json?.error === "forbidden" ||
            json?.error === "order_not_found";
          if (!ownerRejected) {
            setError(typeof json?.error === "string" ? json.error : "load_failed");
            setSnapshot(null);
            return;
          }
        } else {
          const o = json.order;
          setSnapshot({
            buyerOrder: null,
            buyerItems: [],
            ownerOrder: {
              id: orderId,
              order_status: String(o.order_status ?? ""),
              fulfillment_type: String(o.fulfillment_type ?? ""),
            },
            orderNo: String(o.order_no ?? ""),
            storeProfileImageUrl: null,
            storeSlug: null,
            storeBusinessType: null,
            storeCategorySlug: null,
            orderCard: buildStoreOrderChatCardView({
              order: o,
              items: Array.isArray(o.items) ? o.items : [],
              events,
              storeName: json.meta?.store_name,
              storePickupAddressLines: json.meta?.store_pickup_address_lines,
            }),
          });
          return;
        }
      }
      const [{ status, json: raw }, events] = await Promise.all([
        fetchMeStoreOrderDetailDeduped(orderId),
        fetchOrderEvents(orderId),
      ]);
      const json = raw as {
        ok?: boolean;
        error?: string;
        order?: Record<string, unknown> & {
          store_name?: string;
          store_profile_image_url?: string | null;
          store_pickup_address_lines?: string[];
        };
        items?: StoreOrderBuyerItemPayload[];
        store?: { store_name?: string };
      };
      if (status < 200 || status >= 300 || !json?.ok || !json.order) {
        setError(typeof json?.error === "string" ? json.error : "load_failed");
        setSnapshot(null);
        return;
      }
      const orderRow = json.order;
      const storeName = String(orderRow.store_name ?? "").trim() || "매장";
      const buyerOrder = mapBuyerOrder(orderRow, storeName);
      if (
        Array.isArray(orderRow.store_pickup_address_lines) &&
        orderRow.store_pickup_address_lines.length > 0
      ) {
        buyerOrder.store_pickup_address_lines = orderRow.store_pickup_address_lines as string[];
      }
      const storeProfileImageUrl =
        typeof orderRow.store_profile_image_url === "string"
          ? orderRow.store_profile_image_url.trim() || null
          : null;
      const storeSlug =
        typeof orderRow.store_slug === "string" ? orderRow.store_slug.trim() || null : null;
      const storeBusinessType =
        typeof orderRow.store_business_type === "string"
          ? orderRow.store_business_type.trim() || null
          : null;
      const storeCategorySlug =
        typeof orderRow.store_category_slug === "string"
          ? orderRow.store_category_slug.trim() || null
          : null;
      setSnapshot({
        buyerOrder,
        buyerItems: Array.isArray(json.items) ? json.items : [],
        ownerOrder: null,
        orderNo: String(json.order.order_no ?? ""),
        storeProfileImageUrl,
        storeSlug,
        storeBusinessType,
        storeCategorySlug,
        orderCard: buildStoreOrderChatCardView({
          order: orderRow,
          items: Array.isArray(json.items) ? (json.items as Array<Record<string, unknown>>) : [],
          events,
          storeName,
          storePickupAddressLines: Array.isArray(orderRow.store_pickup_address_lines)
            ? (orderRow.store_pickup_address_lines as string[])
            : undefined,
        }),
      });
    } catch {
      setError("network_error");
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [input.enabled, input.isOwner, input.storeId, input.storeOrderId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Customer/Owner room surfaces bind separate role-prefixed channels and projection triggers. */
  const realtimeOrderId = input.enabled ? input.storeOrderId.trim() || null : null;
  useCustomerStoreOrderRowRealtime(input.isOwner ? null : realtimeOrderId, {
    debounceMs: 350,
    onChange: () => {
      void refresh();
    },
  });
  useOwnerStoreOrderRowRealtime(
    {
      storeId: input.isOwner ? input.storeId : null,
      orderId: input.isOwner ? realtimeOrderId : null,
    },
    {
      debounceMs: 350,
      onChange: () => {
        void refresh();
      },
    }
  );

  return { snapshot, loading, error, refresh };
}
