"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { MyBusinessNavList } from "@/components/business/MyBusinessNavList";
import { buildMyBusinessNavGroups } from "@/lib/business/my-business-nav";
import {
  formatStoreOrderSummaryForChatMessage,
  type ChatSummaryItemFields,
  type ChatSummaryOrderFields,
} from "@/lib/stores/format-store-order-chat-summary";
import { OwnerStoreOrderDeliveryActionsDrawerSection } from "@/components/business/owner/OwnerStoreOrderDeliveryActions";

export type StoreOrderSellerOrderPanelPresentation = "drawer" | "modal";

type Props = {
  presentation: StoreOrderSellerOrderPanelPresentation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatRoomId: string;
  storeId: string;
  orderId: string;
  menuRef: React.RefObject<HTMLDivElement | null>;
  moreMenuPanel: React.ReactNode;
  onMoreMenuClick: () => void;
  postChatText: (text: string) => Promise<{ ok: true } | { ok: false; error?: string }>;
  /** 전송 버튼 비활성 (채팅 쓰기 불가 시) */
  sendSummaryDisabled?: boolean;
  /** 주문 패치 후 채팅 메타·메시지 갱신 */
  onRoomReload?: () => void;
  /** `OwnerStoreOrderChatModal`(z-190) 위에 드로어·딤 표시 */
  stackAboveOwnerChatModal?: boolean;
};

export function StoreOrderSellerOrderPanel({
  presentation,
  open,
  onOpenChange,
  chatRoomId,
  storeId,
  orderId,
  menuRef,
  moreMenuPanel,
  onMoreMenuClick,
  postChatText,
  sendSummaryDisabled = false,
  onRoomReload,
  stackAboveOwnerChatModal = false,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [orderSnap, setOrderSnap] = useState<ChatSummaryOrderFields | null>(null);
  const [itemsSnap, setItemsSnap] = useState<ChatSummaryItemFields[]>([]);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendToast, setSendToast] = useState<string | null>(null);

  const titleId = `seller-order-panel-${presentation}-title-${chatRoomId}`;
  const surfaceId =
    presentation === "modal" ? `seller-admin-modal-${chatRoomId}` : `seller-drawer-${chatRoomId}`;
  const heading = presentation === "modal" ? "관리자 메뉴" : "주문";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !open) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onOpenChange(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onOpenChange]);

  const loadOrder = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await fetch(
        `/api/me/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}`,
        { credentials: "include", cache: "no-store" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        order?: Record<string, unknown> & { items?: ChatSummaryItemFields[] };
        meta?: { store_name?: string };
      };
      if (!res.ok || !json?.ok || !json.order) {
        setOrderSnap(null);
        setItemsSnap([]);
        setLoadErr(
          res.status === 404
            ? "주문을 찾을 수 없습니다."
            : typeof json?.error === "string"
              ? json.error
              : "불러오기 실패"
        );
        return;
      }
      const o = json.order;
      const sn = (json.meta?.store_name as string | undefined) ?? "";
      const lines = Array.isArray(o.items) ? o.items : [];
      setOrderSnap({
        store_name: sn || undefined,
        order_no: typeof o.order_no === "string" ? o.order_no : undefined,
        order_status: typeof o.order_status === "string" ? o.order_status : undefined,
        fulfillment_type:
          typeof o.fulfillment_type === "string" && o.fulfillment_type.trim()
            ? o.fulfillment_type.trim()
            : undefined,
        delivery_address_summary: (o.delivery_address_summary as string | null) ?? null,
        delivery_address_detail: (o.delivery_address_detail as string | null) ?? null,
        buyer_phone: (o.buyer_phone as string | null) ?? null,
        buyer_note: (o.buyer_note as string | null) ?? null,
        payment_amount: Number(o.payment_amount ?? 0),
        delivery_fee_amount:
          o.delivery_fee_amount != null && o.delivery_fee_amount !== ""
            ? Number(o.delivery_fee_amount)
            : null,
      });
      setItemsSnap(
        lines.map((row) => ({
          product_title_snapshot: String((row as ChatSummaryItemFields).product_title_snapshot ?? ""),
          price_snapshot: Number((row as ChatSummaryItemFields).price_snapshot ?? 0),
          qty: Number((row as ChatSummaryItemFields).qty ?? 0),
          options_snapshot_json: (row as ChatSummaryItemFields).options_snapshot_json,
        }))
      );
    } catch {
      setLoadErr("네트워크 오류");
      setOrderSnap(null);
      setItemsSnap([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, orderId]);

  useEffect(() => {
    if (!open) return;
    void loadOrder();
  }, [open, loadOrder]);

  /** 모달: `/my/business` 허브와 같은 메뉴 트리 (채팅 맥락의 storeId 기준) */
  const businessNavGroups = useMemo(
    () =>
      buildMyBusinessNavGroups({
        storeId,
        slug: "",
        approvalStatus: "approved",
        isVisible: true,
        canSell: true,
        orderAlertsBadge: 0,
      }),
    [storeId]
  );

  const businessHubHref = `/my/business?storeId=${encodeURIComponent(storeId)}`;

  const handleSendSummary = useCallback(async () => {
    if (!orderSnap || sendBusy || sendSummaryDisabled) return;
    const body = formatStoreOrderSummaryForChatMessage(orderSnap, itemsSnap, "seller");
    setSendBusy(true);
    setSendToast(null);
    const r = await postChatText(body);
    setSendBusy(false);
    if (r.ok) {
      setSendToast("채팅으로 전송했습니다.");
      onOpenChange(false);
    } else {
      setSendToast(r.error?.trim() || "전송에 실패했습니다. 다시 시도해 주세요.");
    }
  }, [orderSnap, itemsSnap, postChatText, sendBusy, sendSummaryDisabled, onOpenChange]);

  const onOrderPatched = useCallback(() => {
    void loadOrder();
    onRoomReload?.();
  }, [loadOrder, onRoomReload]);

  const deliverySection =
    !loading &&
    !loadErr &&
    orderSnap?.order_status &&
    typeof orderId === "string" &&
    orderId.trim() ? (
      <OwnerStoreOrderDeliveryActionsDrawerSection
        storeId={storeId}
        order={{
          id: orderId.trim(),
          order_status: orderSnap.order_status,
          fulfillment_type: orderSnap.fulfillment_type?.trim() || "pickup",
        }}
        onUpdated={onOrderPatched}
      />
    ) : null;

  const dimZ = stackAboveOwnerChatModal ? "z-[220]" : "z-[60]";
  const surfaceZ = stackAboveOwnerChatModal ? "z-[230]" : "z-[70]";

  const headerRow = (
    <div className="flex shrink-0 items-center gap-2 border-b border-ig-border px-3 py-3">
      <h2
        id={titleId}
        className="min-w-0 flex-1 text-[16px] font-semibold leading-[21px] tracking-[-0.02em] text-foreground"
      >
        {heading}
      </h2>
      <div className="relative flex shrink-0 items-center" ref={menuRef}>
        <button
          type="button"
          onClick={onMoreMenuClick}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[20px] font-normal leading-none text-foreground hover:bg-black/[0.05]"
          aria-label="메뉴"
        >
          ⋯
        </button>
        {moreMenuPanel}
      </div>
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[22px] font-light leading-none text-foreground hover:bg-black/[0.05]"
        aria-label="닫기"
      >
        ×
      </button>
    </div>
  );

  const sendBlock = (
    <div className="shrink-0 border-b border-ig-border px-3 py-3">
      <button
        type="button"
        disabled={sendBusy || loading || !orderSnap || !!loadErr || sendSummaryDisabled}
        onClick={() => void handleSendSummary()}
        className="w-full rounded-ui-rect bg-signature px-4 py-3 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {sendBusy ? "전송 중…" : "주문 내용 채팅으로 보내기"}
      </button>
      {sendSummaryDisabled ? (
        <p className="mt-2 text-center text-[12px] text-amber-700">이 채팅에서는 전송할 수 없습니다.</p>
      ) : null}
      {sendToast ? (
        <p className="mt-2 text-center text-[13px] text-muted">{sendToast}</p>
      ) : null}
    </div>
  );

  const orderPreviewBlock = (
    <div className="px-3 py-3 text-[14px] text-foreground">
      {loading ? (
        <p className="text-center text-muted">주문 불러오는 중…</p>
      ) : loadErr ? (
        <p className="text-center text-red-600">{loadErr}</p>
      ) : orderSnap ? (
        <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-[1.45] text-foreground">
          {formatStoreOrderSummaryForChatMessage(orderSnap, itemsSnap, "seller")}
        </pre>
      ) : null}
    </div>
  );

  const scrollBody = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 text-[14px] text-foreground">
      {loading ? (
        <p className="text-center text-muted">주문 불러오는 중…</p>
      ) : loadErr ? (
        <p className="text-center text-red-600">{loadErr}</p>
      ) : orderSnap ? (
        <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-[1.45] text-foreground">
          {formatStoreOrderSummaryForChatMessage(orderSnap, itemsSnap, "seller")}
        </pre>
      ) : null}
    </div>
  );

  const modalPanelInner = (
    <>
      {headerRow}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="border-b border-ig-border px-3 py-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              내 상점
            </p>
            <p className="mb-2 text-[12px] leading-snug text-muted">
              <span className="font-mono text-[11px] text-muted">/my/business</span>
              <span className="mx-1 text-ig-border">·</span>
              매장 관리 허브와 동일한 메뉴입니다.
            </p>
            <Link
              href={businessHubHref}
              onClick={() => onOpenChange(false)}
              className="flex w-full items-center justify-center rounded-ui-rect bg-foreground px-4 py-3 text-[15px] font-semibold text-[var(--sub-bg)] hover:bg-black"
            >
              내 상점 관리로 이동
            </Link>
            <div className="mt-3">
              <MyBusinessNavList
                groups={businessNavGroups}
                onNavigate={() => onOpenChange(false)}
                className="rounded-ui-rect border border-ig-border bg-ig-highlight pb-2 shadow-none"
              />
            </div>
          </div>
          <div className="border-t border-ig-border px-0 pt-1">
            <p className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
              이 채팅 · 주문
            </p>
            {!stackAboveOwnerChatModal ? deliverySection : null}
            <div className="border-b border-ig-border px-3 py-3">
              <button
                type="button"
                disabled={sendBusy || loading || !orderSnap || !!loadErr || sendSummaryDisabled}
                onClick={() => void handleSendSummary()}
                className="w-full rounded-ui-rect bg-signature px-4 py-3 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sendBusy ? "전송 중…" : "주문 내용 채팅으로 보내기"}
              </button>
              {sendSummaryDisabled ? (
                <p className="mt-2 text-center text-[12px] text-amber-700">
                  이 채팅에서는 전송할 수 없습니다.
                </p>
              ) : null}
              {sendToast ? (
                <p className="mt-2 text-center text-[13px] text-muted">{sendToast}</p>
              ) : null}
            </div>
            {orderPreviewBlock}
          </div>
        </div>
      </div>
    </>
  );

  const drawerPanelInner = (
    <>
      {headerRow}
      {!stackAboveOwnerChatModal ? deliverySection : null}
      {sendBlock}
      {scrollBody}
    </>
  );

  const panelInner = presentation === "modal" ? modalPanelInner : drawerPanelInner;

  const portal =
    mounted && typeof document !== "undefined"
      ? createPortal(
          <>
            <div
              role="presentation"
              className={`fixed inset-0 ${dimZ} bg-black/40 transition-opacity duration-300 ease-out ${
                open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
              }`}
              onClick={() => onOpenChange(false)}
              aria-hidden={!open}
            />
            {presentation === "drawer" ? (
              <div
                id={surfaceId}
                className={`fixed top-0 right-0 ${surfaceZ} flex h-[100dvh] w-[min(100vw,22rem)] flex-col bg-white shadow-[-6px_0_24px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-out ${
                  open ? "translate-x-0" : "translate-x-full"
                }`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
              >
                {panelInner}
              </div>
            ) : (
              <div
                className={`fixed inset-0 ${surfaceZ} flex items-end justify-center p-0 sm:items-center sm:p-4 ${
                  open ? "pointer-events-auto" : "pointer-events-none"
                }`}
                role="presentation"
                onClick={() => onOpenChange(false)}
              >
                <div
                  id={surfaceId}
                  className={`flex max-h-[min(90dvh,640px)] w-full max-w-lg flex-col rounded-t-[length:var(--ui-radius-rect)] bg-white shadow-xl transition-all duration-300 ease-out sm:rounded-ui-rect ${
                    open ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0 sm:translate-y-0 sm:scale-95"
                  }`}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={titleId}
                  onClick={(e) => e.stopPropagation()}
                >
                  {panelInner}
                </div>
              </div>
            )}
          </>,
          document.body
        )
      : null;

  if (!mounted || typeof document === "undefined") return null;

  if (presentation === "modal" && !open) return null;

  return portal;
}
