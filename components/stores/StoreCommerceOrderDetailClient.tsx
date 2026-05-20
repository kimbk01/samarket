"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { HistoryBackTextLink } from "@/components/navigation/HistoryBackTextLink";
import { useCallback, useLayoutEffect, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { StoreCommerceOrderTimeline } from "@/components/stores/StoreCommerceOrderTimeline";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  formatPhMobileDisplay,
  parsePhMobileInput,
  telHrefFromPhDb09,
} from "@/lib/utils/ph-mobile";
import { buyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";
import { isStoreOrderChatDisabledForBuyer } from "@/lib/stores/order-status-transitions";
import { StoreOrderMessengerDeepLink } from "@/components/stores/StoreOrderMessengerDeepLink";
import { buildMessengerContextInputFromStoreOrderSnapshot } from "@/lib/community-messenger/store-order-messenger-context";
import { fetchMeStoreOrderDetailDeduped } from "@/lib/stores/store-delivery-api-client";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";

type ItemRow = {
  id: string;
  product_title_snapshot: string;
  price_snapshot: number;
  qty: number;
  subtotal: number;
  options_snapshot_json?: unknown;
};

type OrderDetail = {
  id: string;
  order_no: string;
  store_id: string;
  store_name: string;
  store_slug: string;
  owner_user_id: string;
  buyer_user_id: string;
  total_amount: number;
  payment_amount: number;
  delivery_fee_amount?: number | null;
  payment_status: string;
  order_status: string;
  fulfillment_type: string;
  buyer_note: string | null;
  buyer_phone?: string | null;
  created_at: string;
  updated_at?: string;
  community_messenger_room_id?: string | null;
};


export function StoreCommerceOrderDetailClient({
  storeSlug,
  orderId,
}: {
  storeSlug: string;
  orderId: string;
}) {
  const { t, language } = useI18n();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ok"; order: OrderDetail; items: ItemRow[] }
  >({ kind: "loading" });

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setState((prev) => (prev.kind === "loading" ? prev : { kind: "loading" }));
    }
    try {
      const { status, json } = await fetchMeStoreOrderDetailDeduped(orderId);
      if (status === 401) {
        if (!silent) setState({ kind: "error", message: "로그인이 필요합니다." });
        return;
      }
      if (status === 404) {
        if (!silent) setState({ kind: "error", message: "주문을 찾을 수 없습니다." });
        return;
      }
      const j = json as { ok?: boolean; order?: OrderDetail; items?: ItemRow[] };
      if (!j?.ok || !j.order) {
        if (!silent) setState({ kind: "error", message: "주문을 불러올 수 없습니다." });
        return;
      }
      const ord = j.order as OrderDetail;
      if (ord.store_slug && ord.store_slug !== storeSlug) {
        if (!silent) setState({ kind: "error", message: "이 매장의 주문이 아닙니다." });
        return;
      }
      setState({ kind: "ok", order: ord, items: j.items ?? [] });
    } catch {
      if (!silent) setState({ kind: "error", message: "네트워크 오류가 발생했습니다." });
    }
  }, [orderId, storeSlug]);

  useLayoutEffect(() => {
    void load();
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  if (state.kind === "loading") {
    return <p className="px-4 py-8 text-center text-sm text-sam-muted">{t("common_loading")}</p>;
  }
  if (state.kind === "error") {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-sam-muted">{state.message}</p>
        <Link href={`/stores/${encodeURIComponent(storeSlug)}`} className="mt-4 inline-block text-sm text-signature">
          매장으로
        </Link>
      </div>
    );
  }

  const { order, items } = state;
  const df = Number(order.delivery_fee_amount) || 0;
  const sub = Math.max(0, order.payment_amount - df);
  const orderChatDisabled = isStoreOrderChatDisabledForBuyer(order.order_status);

  return (
    <div className="min-h-screen bg-sam-app px-4 py-4 pb-12">
      <div className="mb-4">
        <HistoryBackTextLink
          fallbackHref={`/stores/${encodeURIComponent(storeSlug)}`}
          className="text-sm text-signature"
          aria-label={t("store_back_to_store_aria")}
        >
          ← 매장
        </HistoryBackTextLink>
      </div>
      <h1 className="text-lg font-bold text-sam-fg">{t("store_order_detail_title")}</h1>
      <p className="mt-1 font-mono text-sm text-sam-muted">{order.order_no}</p>
      <p className="mt-1 text-xs text-sam-muted">
        {t("store_order_status_line", {
          status: buyerOrderStatusLabel(order.order_status, language),
          fulfillment:
            order.fulfillment_type === "pickup"
              ? t("common_pickup_label")
              : t("common_delivery"),
        })}
      </p>

      <section className="mt-4 rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <h2 className="text-sm font-bold text-sam-fg">{t("store_progress_status")}</h2>
        <p className="mt-1 text-xs text-sam-muted">
          주문접수부터 배달완료(또는 픽업완료)까지 4단계로 보여 드립니다. 매장에서
          상태를 바꾸면 갱신되고 채팅에도 안내가 올라갑니다.
        </p>
        <div className="mt-4">
          <StoreCommerceOrderTimeline
            variant="buyer_detail"
            fulfillmentType={order.fulfillment_type}
            orderStatus={order.order_status}
          />
        </div>
      </section>

      <section className="mt-4 rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <h2 className="text-sm font-bold text-sam-fg">{t("store_store_inquiry_chat")}</h2>
        <p className="mt-1 text-xs leading-relaxed text-sam-muted">
          주문 상태는 위 진행 상태에서 확인하고, 요청 사항이나 조율이 필요할 때만 채팅을 이용해 주세요.
        </p>
        {orderChatDisabled ? (
          <span
            className="mt-3 block w-full cursor-not-allowed rounded-ui-rect border border-sam-border bg-sam-surface-muted py-3 text-center text-sm font-semibold text-sam-meta"
            aria-disabled
          >
            매장 문의 열기
          </span>
        ) : (
          <Link
            href={`/my/store-orders/${encodeURIComponent(order.id)}/chat`}
            className="mt-3 block w-full rounded-ui-rect border border-signature bg-signature/5 py-3 text-center text-sm font-semibold text-signature"
          >
            매장 문의 열기
          </Link>
        )}
        {order.community_messenger_room_id ? (
          <div className="mt-3">
            <StoreOrderMessengerDeepLink
              roomId={order.community_messenger_room_id}
              context={buildMessengerContextInputFromStoreOrderSnapshot({
                orderId: order.id,
                storeName: order.store_name,
                orderNo: order.order_no,
                storeId: order.store_id,
                fulfillmentType: order.fulfillment_type,
                orderStatus: order.order_status,
                paymentAmount: order.payment_amount,
                firstLineProductTitle: items[0]?.product_title_snapshot ?? null,
                thumbnailUrl: null,
              })}
            />
          </div>
        ) : null}
      </section>

      <section className="mt-4 rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <h2 className="text-sm font-bold text-sam-fg">{t("store_order_info")}</h2>
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-sam-muted">{t("store_order_vendor")}</dt>
            <dd>{order.store_name}</dd>
          </div>
          {order.buyer_note ? (
            <div>
              <dt className="text-sam-muted">{t("store_request_label")}</dt>
              <dd className="text-sam-fg">{order.buyer_note}</dd>
            </div>
          ) : null}
          {order.buyer_phone ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-sam-muted">{t("store_label_contact")}</dt>
              <dd>
                {(() => {
                  const d = parsePhMobileInput(order.buyer_phone ?? "");
                  const href = d.length === 11 ? telHrefFromPhDb09(d) : null;
                  const label = d.length === 11 ? formatPhMobileDisplay(d) : order.buyer_phone;
                  return href ? (
                    <a href={href} className="font-medium text-signature">
                      {label}
                    </a>
                  ) : (
                    <span className="text-sam-fg">{label}</span>
                  );
                })()}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="mt-4 rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <h2 className="text-sm font-bold text-sam-fg">{t("store_menu_section")}</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {items.map((it) => (
            <li key={it.id} className="flex gap-3 border-b border-sam-border-soft pb-2 last:border-0">
              <StoreProductThumbnail src={null} size={56} roundedClassName="rounded-[10px]" />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-3 font-medium">
                  <span className="min-w-0">
                    {it.product_title_snapshot} ×{it.qty}
                  </span>
                  <span className="shrink-0">{formatMoneyPhp(it.subtotal)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-sam-border-soft pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-sam-muted">{t("store_product_label")}</span>
            <span>{formatMoneyPhp(sub)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sam-muted">{t("store_delivery_fee")}</span>
            <span>{formatMoneyPhp(df)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>{t("store_total")}</span>
            <span>{formatMoneyPhp(order.payment_amount)}</span>
          </div>
        </div>
      </section>

      <Link
        href={`/my/store-orders/${encodeURIComponent(order.id)}`}
        className="mt-4 block text-center text-sm text-signature underline"
      >
        내 주문 상세에서 관리하기
      </Link>
    </div>
  );
}
