"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoreOrderSellerOrderPanel } from "@/components/chats/StoreOrderSellerOrderPanel";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { StoreOrderBuyerRoomSheet } from "@/components/community-messenger/room/phase2/StoreOrderBuyerRoomSheet";
import { useStoreOrderDeliveryRoom } from "@/components/community-messenger/room/phase2/store-order-delivery-room-context";
import { roomHasStoreOrderAutoSummary } from "@/lib/store-order-chat/collapse-duplicate-order-summaries";
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";
import { storeOrderAwaitingFirstPayment } from "@/lib/stores/store-order-awaiting-payment";
import { patchMeStoreOrder } from "@/lib/stores/store-delivery-api-client";
import { STORE_ORDER_MATCH_ACK_MESSAGE } from "@/lib/chats/store-order-match-ack-text";
import {
  messengerDeliveryProgressCurrentStep,
  messengerDeliveryProgressFillRatio,
  messengerDeliveryProgressSteps,
} from "@/lib/store-order-chat/messenger-delivery-progress";
import { formatMoneyPhp } from "@/lib/utils/format";

type Props = {
  keyboardCompact: boolean;
};

/**
 * 배달·매장 주문(`contextMeta.kind === delivery`) — composer 위 chrome.
 * 주문 스냅샷·상세 drawer 는 `StoreOrderDeliveryRoomProvider` 단일 소스.
 */
export function CommunityMessengerRoomPhase2StoreOrderChrome({ keyboardCompact }: Props) {
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
  const headline = meta?.headline?.trim() || "매장 주문";

  const isSeller = participantLooksSeller || Boolean(snapshot?.ownerOrder);
  const displayHeadline =
    snapshot?.orderCard?.storeName || headline.replace(/\s*[·|]\s*주문\s+\S+.*/u, "").trim();

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
    if (typeof window !== "undefined" && !window.confirm("주문을 취소할까요?")) return;
    setCancelBusy(true);
    try {
      const { status, json: raw } = await patchMeStoreOrder(storeOrderId, { cancel: true });
      const json = raw as { ok?: boolean; error?: string };
      if (status < 200 || status >= 300 || !json?.ok) {
        const code = typeof json?.error === "string" ? json.error : "";
        if (typeof window !== "undefined") {
          window.alert(
            code === "cannot_cancel_after_accepted"
              ? "매장이 접수한 뒤에는 여기서 취소할 수 없습니다."
              : "취소에 실패했습니다."
          );
        }
        return;
      }
      await refresh();
      onRoomReload();
    } catch {
      if (typeof window !== "undefined") window.alert("네트워크 오류");
    } finally {
      setCancelBusy(false);
    }
  }, [storeOrderId, snapshot?.buyerOrder, refresh, onRoomReload]);

  const sendMatchAck = useCallback(async () => {
    try {
      await vm.sendMessage(STORE_ORDER_MATCH_ACK_MESSAGE);
      return true;
    } catch {
      return false;
    }
  }, [vm]);

  const hasAutoSummary = useMemo(
    () => roomHasStoreOrderAutoSummary(vm.snapshot.messages),
    [vm.snapshot.messages]
  );

  const openOrderDetailDrawer = useCallback(() => {
    setDetailDrawerOpen(true);
  }, [setDetailDrawerOpen]);

  useEffect(() => {
    if (!isSeller || keyboardCompact) return;
    const id = window.requestAnimationFrame(() => vm.scrollMessengerToBottom());
    return () => window.cancelAnimationFrame(id);
  }, [isSeller, keyboardCompact, snapshot?.ownerOrder?.order_status, vm]);

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
        drawerVariant="peek"
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
        hideSendSummary={hasAutoSummary}
        hidePeekDrawerMoreMenu
        onVoiceCall={() => void vm.startManagedDirectCall("voice")}
        voiceCallDisabled={vm.roomUnavailable || vm.outgoingDialLocked}
      />
    ) : null;

  if (!vm.showMessengerStoreOrderDock || !storeOrderId) return null;

  if (keyboardCompact) {
    return (
      <>
        <div
          className="shrink-0 border-t border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-surface-muted)] px-3 py-2"
          role="region"
          aria-label="주문 정보"
        >
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p className="min-w-0 truncate sam-text-helper text-[color:var(--cm-room-text)]">
              {statusLabel ? (
                <span className="font-semibold text-[color:var(--cm-room-primary)]">{statusLabel}</span>
              ) : (
                displayHeadline
              )}
            </p>
            <button
              type="button"
              onClick={openOrderDetailDrawer}
              className="shrink-0 rounded-ui-rect border border-[color:var(--cm-room-primary)]/40 bg-[color:var(--cm-room-primary-soft)] px-2 py-1 sam-text-xxs font-semibold text-[color:var(--cm-room-primary)]"
            >
              {isSeller ? "주문" : "내역"}
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
        orderNo={
          snapshot?.orderCard?.orderNo ??
          snapshot?.buyerOrder?.order_no ??
          snapshot?.orderNo ??
          storeOrderId
        }
        storeName={displayHeadline}
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
          snapshot?.buyerOrder?.delivery_address_summary ??
          ""
        }
      />
      {buyerOrderSheet}
      {sellerOrderPanel}
    </>
  );
}

function DeliveryChromeStrip({
  orderNo,
  storeName,
  statusLabel,
  orderStatus,
  deliveryLike,
  fulfillmentType,
  paymentAmount,
  addressLine,
}: {
  orderNo: string;
  storeName: string;
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
  const currentStep = messengerDeliveryProgressCurrentStep(statusKey, ft);
  const fillRatio = messengerDeliveryProgressFillRatio(statusKey, ft);
  const paymentLabel =
    paymentAmount != null && Number.isFinite(Number(paymentAmount)) && Number(paymentAmount) > 0
      ? formatMoneyPhp(Number(paymentAmount))
      : "";

  return (
    <div
      data-store-order-delivery-chrome
      className="shrink-0 border-t border-[#DDE5E0] bg-[#f6f6f6] px-3 py-2.5 shadow-none"
      role="region"
      aria-label="주문 정보"
    >
      <div className="rounded-[4px] border border-[#DDE5E0] bg-white p-2.5 shadow-none">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold leading-[1.35] text-[#6B7280]">
              {orderNo}
            </p>
            <p className="mt-0.5 truncate text-[13px] font-bold leading-[1.35] text-[#123B4A]">
              {storeName || "주문 진행"}
            </p>
            {addressLine?.trim() ? (
              <p className="mt-0.5 line-clamp-1 text-[11px] leading-[1.35] text-[#6B7280]">
                {addressLine.trim()}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <span className="inline-flex rounded-[4px] bg-[#1C8DB8] px-2 py-0.5 text-[11px] font-bold leading-[1.35] text-white">
              {statusLabel || "진행중"}
            </span>
            {paymentLabel ? (
              <p className="mt-1 text-[12px] font-bold leading-[1.35] text-[#123B4A]">{paymentLabel}</p>
            ) : null}
          </div>
        </div>
        <DeliveryOrderProgressRail steps={deliverySteps} currentStep={currentStep} fillRatio={fillRatio} />
      </div>
    </div>
  );
}

function DeliveryOrderProgressRail({
  steps,
  currentStep,
  fillRatio,
}: {
  steps: string[];
  currentStep: number;
  fillRatio: number;
}) {
  const fillWidthPercent = Math.max(0, Math.min(100, fillRatio * 100));

  return (
    <div className="sam-delivery-order-progress space-y-1.5" aria-label="주문 진행 단계">
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
              ? "text-[#123B4A]"
              : idx === currentStep
                ? "font-bold text-[#1C8DB8]"
                : "text-[#D1D5DB]";
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
