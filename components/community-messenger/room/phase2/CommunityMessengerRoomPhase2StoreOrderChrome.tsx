"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

type StoreOrderI18nT = (key: MessageKey, vars?: Record<string, string | number>) => string;
import { StoreOrderSellerOrderPanel } from "@/components/chats/StoreOrderSellerOrderPanel";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { StoreOrderBuyerRoomSheet } from "@/components/community-messenger/room/phase2/StoreOrderBuyerRoomSheet";
import { useStoreOrderDeliveryRoom } from "@/components/community-messenger/room/phase2/store-order-delivery-room-context";
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";
import { storeOrderAwaitingFirstPayment } from "@/lib/stores/store-order-awaiting-payment";
import { patchMeStoreOrder } from "@/lib/stores/store-delivery-api-client";
import { STORE_ORDER_MATCH_ACK_MESSAGE } from "@/lib/chats/store-order-match-ack-text";
import {
  messengerDeliveryProgressCurrentStep,
  messengerDeliveryProgressFillRatio,
  messengerDeliveryProgressSteps,
} from "@/lib/store-order-chat/messenger-delivery-progress";
import { formatStoreOrderDeliveryAddressPlain } from "@/lib/addresses/store-order-delivery-address-display";
import { formatMoneyPhp } from "@/lib/utils/format";
import { scheduleMessengerScrollToBottomAfterRowsPainted } from "@/lib/community-messenger/room/messenger-timeline-layout-mode";
import {
  resolveDeliveryChromePrimaryLabel,
  resolveDeliveryPeerUserId,
} from "@/lib/store-order-chat/messenger-delivery-room-header";

type Props = {
  keyboardCompact: boolean;
};

/**
 * 배달·매장 주문(`contextMeta.kind === delivery`) — composer 위 chrome.
 * 주문 스냅샷·상세 drawer 는 `StoreOrderDeliveryRoomProvider` 단일 소스.
 */
export function CommunityMessengerRoomPhase2StoreOrderChrome({ keyboardCompact }: Props) {
  const { t } = useI18n();
  const vm = useMessengerRoomPhase2View();
  const {
    snapshot,
    loading,
    error,
    refresh,
    detailDrawerOpen,
    setDetailDrawerOpen,
  } = useStoreOrderDeliveryRoom();
  const meta = vm.snapshot.room.contextMeta as CommunityMessengerRoomContextMetaV1 | null | undefined;
  const storeOrderId = typeof meta?.storeOrderId === "string" ? meta.storeOrderId.trim() : "";
  const storeId = typeof meta?.storeId === "string" ? meta.storeId.trim() : "";
  const participantLooksSeller = vm.snapshot.myRole === "owner" && storeOrderId.length > 0;

  const [cancelBusy, setCancelBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const statusLabel = meta?.stepLabel?.trim() || null;

  const isSeller = participantLooksSeller || Boolean(snapshot?.ownerOrder);

  const deliveryPeerUserId = useMemo(
    () =>
      resolveDeliveryPeerUserId({
        peerUserId: vm.snapshot.room.peerUserId ?? "",
        viewerUserId: vm.snapshot.viewerUserId ?? "",
        memberIds: vm.snapshot.members.map((m) => m.id),
      }),
    [vm.snapshot.members, vm.snapshot.room.peerUserId, vm.snapshot.viewerUserId]
  );
  const peerProfileLabel = useMemo(
    () => vm.snapshot.members.find((m) => m.id.trim() === deliveryPeerUserId)?.label ?? null,
    [deliveryPeerUserId, vm.snapshot.members]
  );
  const chromePrimaryLabel = useMemo(
    () =>
      resolveDeliveryChromePrimaryLabel({
        isSeller,
        storeOrderSnap: snapshot,
        peerProfileLabel,
        roomTitle: vm.snapshot.room.title,
        deliveryHeadline: meta?.kind === "delivery" ? meta.headline : undefined,
      }),
    [isSeller, meta, peerProfileLabel, snapshot, vm.snapshot.room.title]
  );

  const postChatText = useCallback(
    async (text: string): Promise<{ ok: true } | { ok: false; error?: string }> => {
      const raw = text.trim();
      if (!raw) return { ok: false, error: "empty" };
      await vm.sendMessage(raw);
      return { ok: true };
    },
    [vm]
  );

  const onRoomReload = useCallback(() => {
    void refresh();
    void vm.refresh(true);
  }, [refresh, vm]);

  const handleCancel = useCallback(async () => {
    if (!storeOrderId || !snapshot?.buyerOrder) return;
    if (typeof window !== "undefined" && !window.confirm(t("chats_store_order_cancel_confirm"))) return;
    setCancelBusy(true);
    try {
      const { status, json: raw } = await patchMeStoreOrder(storeOrderId, { cancel: true });
      const json = raw as { ok?: boolean; error?: string };
      if (status < 200 || status >= 300 || !json?.ok) {
        const code = typeof json?.error === "string" ? json.error : "";
        if (typeof window !== "undefined") {
          window.alert(
            code === "cannot_cancel_after_accepted"
              ? t("mypage_comp_orders_cancel_err_short")
              : t("store_messenger_cancel_failed")
          );
        }
        return;
      }
      await refresh();
      onRoomReload();
    } catch {
      if (typeof window !== "undefined") window.alert(t("store_owner_err_network"));
    } finally {
      setCancelBusy(false);
    }
  }, [storeOrderId, snapshot?.buyerOrder, refresh, onRoomReload, t]);

  const sendMatchAck = useCallback(async () => {
    try {
      await vm.sendMessage(STORE_ORDER_MATCH_ACK_MESSAGE);
      return true;
    } catch {
      return false;
    }
  }, [vm]);

  const openOrderDetailDrawer = useCallback(() => {
    setDetailDrawerOpen(true);
  }, [setDetailDrawerOpen]);

  /** 키보드로 chrome 1줄 접힐 때만 스크롤 — 진입·상태 변경은 timeline_delivery_direct_paint·dock ResizeObserver 가 담당 */
  useEffect(() => {
    if (!keyboardCompact) return;
    return scheduleMessengerScrollToBottomAfterRowsPainted({
      roomId: vm.streamRoomId,
      messagesViewportRef: vm.messagesViewportRef,
      scroll: vm.scrollMessengerToBottom,
      reason: "store_order_chrome_keyboard_compact",
    });
  }, [keyboardCompact, vm.messagesViewportRef, vm.scrollMessengerToBottom, vm.streamRoomId]);

  const buyerCanCancel =
    !!snapshot?.buyerOrder &&
    storeOrderAwaitingFirstPayment({
      payment_status: snapshot.buyerOrder.payment_status,
      order_status: snapshot.buyerOrder.order_status,
    });

  const buyerOrderSheet = !isSeller ? (
    <StoreOrderBuyerRoomSheet
      open={detailDrawerOpen}
      onOpenChange={setDetailDrawerOpen}
      sheetVariant="peek"
      orderId={storeOrderId}
      order={snapshot?.buyerOrder ?? null}
      items={snapshot?.buyerItems ?? []}
      orderCard={snapshot?.orderCard ?? null}
      orderLoading={loading}
      orderError={error}
      canCancel={buyerCanCancel}
      cancelBusy={cancelBusy}
      onCancel={() => void handleCancel()}
      chatRoomId={vm.snapshot.room.id}
      onSendOrderMatchAck={sendMatchAck}
      onVoiceCall={() => void vm.startManagedDirectCall("voice")}
      voiceCallDisabled={vm.roomUnavailable || vm.outgoingDialLocked}
    />
  ) : null;

  const sellerOrderPanel =
    isSeller && storeId ? (
      <StoreOrderSellerOrderPanel
        presentation="drawer"
        open={detailDrawerOpen}
        onOpenChange={setDetailDrawerOpen}
        chatRoomId={vm.snapshot.room.id}
        storeId={storeId}
        orderId={storeOrderId}
        menuRef={menuRef}
        moreMenuPanel={null}
        onMoreMenuClick={() => undefined}
        postChatText={postChatText}
        sendSummaryDisabled={vm.roomUnavailable}
        onRoomReload={onRoomReload}
      />
    ) : null;

  if (!vm.showMessengerStoreOrderDock || !storeOrderId) return null;

  if (keyboardCompact) {
    return (
      <>
        <div
          className="delivery-ui shrink-0 border-t border-[color:var(--delivery-chat-chrome-border)] bg-[color:var(--delivery-chat-chrome-bg)] px-3 py-2"
          role="region"
          aria-label={t("store_order_info")}
        >
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p className="min-w-0 truncate sam-text-helper text-[color:var(--delivery-dark)]">
              {statusLabel ? (
                <span className="font-semibold text-[color:var(--delivery-primary)]">{statusLabel}</span>
              ) : (
                chromePrimaryLabel
              )}
            </p>
            <button
              type="button"
              onClick={openOrderDetailDrawer}
              className="shrink-0 rounded-ui-rect border border-[color:var(--delivery-primary-border)] bg-[color:var(--delivery-primary-soft)] px-2 py-1 sam-text-xxs font-semibold text-[color:var(--delivery-primary)]"
            >
              {isSeller ? t("store_messenger_chrome_order_btn") : t("store_messenger_chrome_history_btn")}
            </button>
          </div>
        </div>
        {buyerOrderSheet}
        {sellerOrderPanel}
      </>
    );
  }

  return (
    <>
      <DeliveryChromeStrip
        t={t}
        orderNo={
          snapshot?.orderCard?.orderNo ??
          snapshot?.buyerOrder?.order_no ??
          snapshot?.orderNo ??
          storeOrderId
        }
        primaryLabel={chromePrimaryLabel}
        statusLabel={
          snapshot?.orderCard?.statusLabel ??
          statusLabel ??
          snapshot?.buyerOrder?.order_status ??
          snapshot?.ownerOrder?.order_status ??
          ""
        }
        orderStatus={
          snapshot?.orderCard?.status ??
          snapshot?.buyerOrder?.order_status ??
          snapshot?.ownerOrder?.order_status ??
          null
        }
        deliveryLike={Boolean(snapshot?.orderCard?.isDelivery)}
        fulfillmentType={
          snapshot?.orderCard?.fulfillmentType ??
          snapshot?.buyerOrder?.fulfillment_type ??
          snapshot?.ownerOrder?.fulfillment_type ??
          ""
        }
        paymentAmount={
          snapshot?.orderCard?.totals.paymentTotal ??
          snapshot?.buyerOrder?.payment_amount ??
          null
        }
        addressLine={
          snapshot?.orderCard?.addressLines?.[0] ??
          formatStoreOrderDeliveryAddressPlain({
            summary: snapshot?.buyerOrder?.delivery_address_summary,
            detail: snapshot?.buyerOrder?.delivery_address_detail,
          }) ??
          ""
        }
      />
      {buyerOrderSheet}
      {sellerOrderPanel}
    </>
  );
}

const MESSENGER_DELIVERY_PROGRESS_STEP_KEYS = [
  "store_messenger_progress_step_new_order",
  "store_messenger_progress_step_accepted",
  "store_messenger_progress_step_preparing",
  "store_messenger_progress_step_delivery_ready",
  "store_messenger_progress_step_delivering",
  "store_messenger_progress_step_near_address",
  "store_messenger_progress_step_done",
] as const satisfies readonly MessageKey[];

const MESSENGER_PICKUP_PROGRESS_STEP_KEYS = [
  "store_messenger_progress_step_new_order",
  "store_messenger_progress_step_accepted",
  "store_messenger_progress_step_preparing",
  "store_messenger_progress_step_pickup_ready",
  "store_messenger_progress_step_pickup_done",
] as const satisfies readonly MessageKey[];

function DeliveryChromeStrip({
  t,
  orderNo,
  primaryLabel,
  statusLabel,
  orderStatus,
  deliveryLike,
  fulfillmentType,
  paymentAmount,
  addressLine,
}: {
  t: StoreOrderI18nT;
  orderNo: string;
  primaryLabel: string;
  statusLabel: string;
  orderStatus: string | null;
  deliveryLike: boolean;
  fulfillmentType: string;
  paymentAmount: number | null;
  addressLine: string | null;
}) {
  const statusKey = (orderStatus ?? "").trim() || "pending";
  const ft = fulfillmentType.trim() || (deliveryLike ? "local_delivery" : "pickup");
  const deliverySteps = [...messengerDeliveryProgressSteps(ft)];
  const stepKeys = deliveryLike ? MESSENGER_DELIVERY_PROGRESS_STEP_KEYS : MESSENGER_PICKUP_PROGRESS_STEP_KEYS;
  const localizedSteps = deliverySteps.map((step, idx) =>
    stepKeys[idx] ? t(stepKeys[idx]!) : step
  );
  const currentStep = messengerDeliveryProgressCurrentStep(statusKey, ft);
  const fillRatio = messengerDeliveryProgressFillRatio(statusKey, ft);
  const paymentLabel =
    paymentAmount != null && Number.isFinite(Number(paymentAmount)) && Number(paymentAmount) > 0
      ? formatMoneyPhp(Number(paymentAmount))
      : "";

  return (
    <div
      data-store-order-delivery-chrome
      className="delivery-ui shrink-0 border-t border-[color:var(--delivery-chat-chrome-border)] bg-[color:var(--delivery-chat-chrome-bg)] px-3 py-2.5"
      role="region"
      aria-label={t("store_order_info")}
    >
      <div className="rounded-[var(--delivery-radius)] border border-[color:var(--delivery-border)] bg-[color:var(--delivery-bg-card)] p-2.5 shadow-[0_2px_8px_rgba(30,57,50,0.06)]">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold leading-[1.35] text-[color:var(--delivery-text-muted)]">
              {orderNo}
            </p>
            <p className="mt-0.5 truncate text-[13px] font-bold leading-[1.35] text-[color:var(--delivery-dark)]">
              {primaryLabel || t("store_messenger_order_in_progress")}
            </p>
            {addressLine?.trim() ? (
              <p className="mt-0.5 line-clamp-1 text-[11px] leading-[1.35] text-[color:var(--delivery-mocha)]">
                {addressLine.trim()}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <span className="delivery-ui inline-flex rounded-[var(--delivery-radius)] bg-[color:var(--delivery-primary)] px-2 py-0.5 text-[11px] font-bold leading-[1.35] text-white">
              {statusLabel || t("common_in_progress")}
            </span>
            {paymentLabel ? (
              <p className="mt-1 text-[12px] font-bold leading-[1.35] text-[color:var(--delivery-dark)]">
                {paymentLabel}
              </p>
            ) : null}
          </div>
        </div>
        <DeliveryOrderProgressRail
          t={t}
          steps={localizedSteps}
          currentStep={currentStep}
          fillRatio={fillRatio}
        />
      </div>
    </div>
  );
}

function DeliveryOrderProgressRail({
  t,
  steps,
  currentStep,
  fillRatio,
}: {
  t: StoreOrderI18nT;
  steps: string[];
  currentStep: number;
  fillRatio: number;
}) {
  const fillWidthPercent = Math.max(0, Math.min(100, fillRatio * 100));

  return (
    <div className="sam-delivery-order-progress space-y-1.5" aria-label={t("store_order_timeline_aria")}>
      <div className="sam-delivery-order-progress__track">
        <div
          className="sam-delivery-order-progress__fill-clip"
          style={{ width: `${fillWidthPercent}%` }}
        >
          <div className="sam-delivery-order-progress__fill" aria-hidden />
        </div>
      </div>

      <div
        className="grid gap-1.5 text-center text-[11px]"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step, idx) => {
          const tone =
            idx < currentStep
              ? "text-[color:var(--delivery-dark)]"
              : idx === currentStep
                ? "font-bold text-[color:var(--delivery-primary)]"
                : "text-[color:var(--delivery-text-disabled)]";
          return (
            <span key={step} className={`block truncate ${tone}`}>
              {step}
            </span>
          );
        })}
      </div>
    </div>
  );
}
