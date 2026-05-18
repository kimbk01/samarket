"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoreOrderSellerOrderPanel } from "@/components/chats/StoreOrderSellerOrderPanel";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { StoreOrderBuyerRoomSheet } from "@/components/community-messenger/room/phase2/StoreOrderBuyerRoomSheet";
import { StoreOrderOwnerMessengerActionBar } from "@/components/community-messenger/room/phase2/StoreOrderOwnerMessengerActionBar";
import { roomHasStoreOrderAutoSummary } from "@/lib/store-order-chat/collapse-duplicate-order-summaries";
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";
import { useStoreOrderRoomSnapshot } from "@/lib/store-order-chat/use-store-order-room-snapshot";
import { storeOrderAwaitingFirstPayment } from "@/lib/stores/store-order-awaiting-payment";
import { patchMeStoreOrder } from "@/lib/stores/store-delivery-api-client";
import { STORE_ORDER_MATCH_ACK_MESSAGE } from "@/lib/chats/store-order-match-ack-text";

type Props = {
  keyboardCompact: boolean;
};

/**
 * 배달·매장 주문(`contextMeta.kind === delivery`) — composer 위 chrome.
 * 구매자: 주문 시트·취소 / 사장님: 배민형 진행 CTA + 주문 패널.
 */
export function CommunityMessengerRoomPhase2StoreOrderChrome({ keyboardCompact }: Props) {
  const vm = useMessengerRoomPhase2View();
  const meta = vm.snapshot.room.contextMeta as CommunityMessengerRoomContextMetaV1 | null | undefined;
  const storeOrderId = typeof meta?.storeOrderId === "string" ? meta.storeOrderId.trim() : "";
  const storeId = typeof meta?.storeId === "string" ? meta.storeId.trim() : "";
  const participantLooksSeller = vm.snapshot.myRole === "owner" && storeOrderId.length > 0;

  const [sellerDrawerOpen, setSellerDrawerOpen] = useState(false);
  const [sellerAdminModalOpen, setSellerAdminModalOpen] = useState(false);
  const [buyerSheetOpen, setBuyerSheetOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const statusLabel = meta?.stepLabel?.trim() || null;
  const headline = meta?.headline?.trim() || "매장 주문";
  const priceLabel = meta?.priceLabel?.trim();

  const { snapshot, loading, error, refresh } = useStoreOrderRoomSnapshot({
    storeOrderId,
    storeId,
    isOwner: Boolean(storeId),
    enabled: vm.showMessengerStoreOrderDock && Boolean(storeOrderId),
  });
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

  const openSellerOrderPanel = useCallback(() => {
    setSellerAdminModalOpen(false);
    setSellerDrawerOpen(true);
  }, []);

  useEffect(() => {
    if (!isSeller || keyboardCompact) return;
    const id = window.requestAnimationFrame(() => vm.scrollMessengerToBottom());
    return () => window.cancelAnimationFrame(id);
  }, [isSeller, keyboardCompact, snapshot?.ownerOrder?.order_status, vm]);

  if (!vm.showMessengerStoreOrderDock || !storeOrderId) return null;

  const sellerActionBar =
    isSeller && storeId && snapshot?.ownerOrder ? (
      <StoreOrderOwnerMessengerActionBar
        storeId={storeId}
        order={snapshot.ownerOrder}
        orderNo={snapshot.orderNo || meta?.orderNo?.trim() || ""}
        onUpdated={onRoomReload}
        onOpenOrderPanel={openSellerOrderPanel}
      />
    ) : isSeller && storeId && loading ? (
      <div className="shrink-0 border-t border-[color:var(--cm-room-divider)] px-3 py-2.5 sam-text-xxs text-[color:var(--cm-room-text-muted)]">
        주문 정보 불러오는 중…
      </div>
    ) : null;

  const sellerOrderPanel =
    isSeller && storeId ? (
      <StoreOrderSellerOrderPanel
        presentation={sellerAdminModalOpen ? "modal" : "drawer"}
        open={sellerDrawerOpen || sellerAdminModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSellerDrawerOpen(false);
            setSellerAdminModalOpen(false);
          }
        }}
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
        hideDeliveryActions
      />
    ) : null;


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
            {isSeller ? (
              <button
                type="button"
                onClick={openSellerOrderPanel}
                className="shrink-0 rounded-ui-rect border border-[color:var(--cm-room-primary)]/40 bg-[color:var(--cm-room-primary-soft)] px-2 py-1 sam-text-xxs font-semibold text-[color:var(--cm-room-primary)]"
              >
                주문
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setBuyerSheetOpen(true)}
                className="shrink-0 rounded-ui-rect border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-surface)] px-2 py-1 sam-text-xxs font-semibold text-[color:var(--cm-room-primary)]"
              >
                내역
              </button>
            )}
          </div>
        </div>
        {!isSeller && !loading ? (
          <StoreOrderBuyerRoomSheet
            open={buyerSheetOpen}
            onOpenChange={setBuyerSheetOpen}
            orderId={storeOrderId}
            order={snapshot?.buyerOrder ?? null}
            items={snapshot?.buyerItems ?? []}
            orderCard={snapshot?.orderCard ?? null}
            orderLoading={loading}
            orderError={error}
            canCancel={
              !!snapshot?.buyerOrder &&
              storeOrderAwaitingFirstPayment({
                payment_status: snapshot.buyerOrder.payment_status,
                order_status: snapshot.buyerOrder.order_status,
              })
            }
            cancelBusy={cancelBusy}
            onCancel={() => void handleCancel()}
            chatRoomId={vm.snapshot.room.id}
            onSendOrderMatchAck={sendMatchAck}
          />
        ) : null}
        {sellerOrderPanel}
      </>
    );
  }

  return (
    <>
      <DeliveryChromeStrip
        isSeller={isSeller}
        headline={displayHeadline}
        statusLabel={statusLabel}
        priceLabel={priceLabel}
        storeOrderId={storeOrderId}
        onBuyerSheetOpen={() => setBuyerSheetOpen(true)}
        onSellerDrawerOpen={() => {
          setSellerAdminModalOpen(false);
          setSellerDrawerOpen(true);
        }}
        onSellerAdminOpen={() => {
          setSellerDrawerOpen(false);
          setSellerAdminModalOpen(true);
        }}
      />

      {!isSeller && !loading ? (
        <StoreOrderBuyerRoomSheet
          open={buyerSheetOpen}
          onOpenChange={setBuyerSheetOpen}
          orderId={storeOrderId}
          order={snapshot?.buyerOrder ?? null}
          items={snapshot?.buyerItems ?? []}
          orderCard={snapshot?.orderCard ?? null}
          orderLoading={loading}
          orderError={error}
          canCancel={
            !!snapshot?.buyerOrder &&
            storeOrderAwaitingFirstPayment({
              payment_status: snapshot.buyerOrder.payment_status,
              order_status: snapshot.buyerOrder.order_status,
            })
          }
          cancelBusy={cancelBusy}
          onCancel={() => void handleCancel()}
          chatRoomId={vm.snapshot.room.id}
          onSendOrderMatchAck={sendMatchAck}
        />
      ) : null}
      {sellerActionBar}
      {sellerOrderPanel}
    </>
  );
}

function DeliveryChromeStrip({
  isSeller,
  headline,
  statusLabel,
  priceLabel,
  storeOrderId,
  onBuyerSheetOpen,
  onSellerDrawerOpen,
  onSellerAdminOpen,
}: {
  isSeller: boolean;
  headline: string;
  statusLabel: string | null;
  priceLabel: string | undefined;
  storeOrderId: string;
  onBuyerSheetOpen: () => void;
  onSellerDrawerOpen: () => void;
  onSellerAdminOpen: () => void;
}) {
  return (
    <div
      className="shrink-0 border-t border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-delivery-chrome-bg,var(--cm-room-surface-muted))] px-3 py-2.5"
      role="region"
      aria-label="주문 정보"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex shrink-0 items-center rounded-ui-rect bg-[color:var(--messenger-badge-delivery-bg)] px-1.5 py-0.5 sam-text-xxs font-bold text-[color:var(--cm-room-text)]">
          배달주문
        </span>
        <p className="min-w-0 flex-1 truncate sam-text-body font-semibold text-[color:var(--cm-room-text)]">
          {headline}
        </p>
      </div>
      <p className="mb-2 sam-text-helper text-[color:var(--cm-room-text-muted)]">
        {statusLabel ? (
          <>
            <span className="font-medium text-[color:var(--cm-room-primary)]">{statusLabel}</span>
            {priceLabel ? <span aria-hidden> · </span> : null}
          </>
        ) : null}
        {priceLabel ? <span>{priceLabel}</span> : null}
      </p>
      {!isSeller ? (
        <DeliveryChromeActions
          isSeller={false}
          storeOrderId={storeOrderId}
          onBuyerSheetOpen={onBuyerSheetOpen}
          onSellerDrawerOpen={onSellerDrawerOpen}
          onSellerAdminOpen={onSellerAdminOpen}
        />
      ) : (
        <p className="sam-text-xxs text-[color:var(--cm-room-text-muted)]">
          아래에서 접수·배달 단계를 진행하세요. 상세·메뉴는 「주문 패널」을 여세요.
        </p>
      )}
    </div>
  );
}

function DeliveryChromeActions({
  isSeller,
  storeOrderId,
  onBuyerSheetOpen,
  onSellerDrawerOpen,
  onSellerAdminOpen,
}: {
  isSeller: boolean;
  storeOrderId: string;
  onBuyerSheetOpen: () => void;
  onSellerDrawerOpen: () => void;
  onSellerAdminOpen: () => void;
}) {
  if (isSeller) {
    return (
      <DeliveryChromeActionsSeller
        onSellerDrawerOpen={onSellerDrawerOpen}
        onSellerAdminOpen={onSellerAdminOpen}
      />
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={onBuyerSheetOpen}
        className="rounded-ui-rect border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-surface)] px-2.5 py-1.5 sam-text-helper font-semibold text-[color:var(--cm-room-text)]"
      >
        주문내역
      </button>
      <Link
        href={`/mypage/store-orders/${encodeURIComponent(storeOrderId)}`}
        className="rounded-ui-rect border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-surface)] px-2.5 py-1.5 sam-text-helper font-semibold text-[color:var(--cm-room-primary)]"
      >
        주문상세
      </Link>
    </div>
  );
}

function DeliveryChromeActionsSeller({
  onSellerDrawerOpen,
  onSellerAdminOpen,
}: {
  onSellerDrawerOpen: () => void;
  onSellerAdminOpen: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <button
        type="button"
        onClick={onSellerDrawerOpen}
        className="rounded-ui-rect border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-surface)] px-2.5 py-1.5 sam-text-helper font-semibold text-[color:var(--cm-room-text)]"
      >
        주문 패널
      </button>
      <button
        type="button"
        onClick={onSellerAdminOpen}
        className="rounded-ui-rect border border-[color:var(--cm-room-primary)]/40 bg-[color:var(--cm-room-primary-soft)] px-2.5 py-1.5 sam-text-helper font-semibold text-[color:var(--cm-room-primary)]"
      >
        관리
      </button>
    </div>
  );
}
