"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useRegisterOpenOverlay } from "@/lib/ui/use-register-open-overlay";

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
  /** 사장님 주문 채팅 슬라이드(z-80/81) 안에서 열 때 — 드로어·딤만 그 위로 (내용은 그대로) */
  aboveOwnerChatSlide?: boolean;
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
  aboveOwnerChatSlide = false,
}: Props) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [orderSnap, setOrderSnap] = useState<ChatSummaryOrderFields | null>(null);
  const [itemsSnap, setItemsSnap] = useState<ChatSummaryItemFields[]>([]);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendToast, setSendToast] = useState<string | null>(null);
  useRegisterOpenOverlay(open);

  const titleId = `seller-order-panel-${presentation}-title-${chatRoomId}`;
  const surfaceId =
    presentation === "modal" ? `seller-admin-modal-${chatRoomId}` : `seller-drawer-${chatRoomId}`;
  const heading = presentation === "modal" ? t("chats_admin_menu") : t("chats_seller_panel_order_title");

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
            ? t("chats_store_order_not_found")
            : typeof json?.error === "string"
              ? json.error
              : t("chats_store_order_load_failed")
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
      setLoadErr(t("chats_store_order_network_error"));
      setOrderSnap(null);
      setItemsSnap([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, orderId, t]);

  useEffect(() => {
    if (!open) return;
    void loadOrder();
  }, [open, loadOrder]);

  /** 모달: `/stores/owner` 허브와 같은 메뉴 트리 (채팅 맥락의 storeId 기준) */
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

  const businessHubHref = `/stores/owner?storeId=${encodeURIComponent(storeId)}`;

  const handleSendSummary = useCallback(async () => {
    if (!orderSnap || sendBusy || sendSummaryDisabled) return;
    const body = formatStoreOrderSummaryForChatMessage(orderSnap, itemsSnap, "seller");
    setSendBusy(true);
    setSendToast(null);
    const r = await postChatText(body);
    setSendBusy(false);
    if (r.ok) {
      setSendToast(t("chats_seller_panel_sent_toast"));
      onOpenChange(false);
    } else {
      setSendToast(r.error?.trim() || t("chats_seller_panel_send_failed_toast"));
    }
  }, [orderSnap, itemsSnap, postChatText, sendBusy, sendSummaryDisabled, onOpenChange, t]);

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

  const raiseLayer = stackAboveOwnerChatModal || aboveOwnerChatSlide;
  const dimZ = raiseLayer ? "z-[220]" : "z-[60]";
  const surfaceZ = raiseLayer ? "z-[230]" : "z-[70]";

  const headerRow = (
    <div className="flex shrink-0 items-center gap-2 border-b border-sam-border px-3 py-3">
      <h2
        id={titleId}
        className="min-w-0 flex-1 sam-text-body-lg font-semibold leading-[21px] tracking-[-0.02em] text-foreground"
      >
        {heading}
      </h2>
      <div className="relative flex shrink-0 items-center" ref={menuRef}>
        <button
          type="button"
          onClick={onMoreMenuClick}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full sam-text-page-title font-normal leading-none text-foreground transition hover:bg-black/[0.05] active:scale-[var(--overlay-press-scale)] active:bg-black/[0.08]"
          aria-label={t("ui_home_rail_menu_open")}
        >
          ⋯
        </button>
        {moreMenuPanel}
      </div>
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full sam-text-hero font-light leading-none text-foreground transition hover:bg-black/[0.05] active:scale-[var(--overlay-press-scale)] active:bg-black/[0.08]"
        aria-label={t("ui_sheet_close_aria")}
      >
        ×
      </button>
    </div>
  );

  const sendBlock = (
    <div className="shrink-0 border-b border-sam-border px-3 py-3">
      <button
        type="button"
        disabled={sendBusy || loading || !orderSnap || !!loadErr || sendSummaryDisabled}
        onClick={() => void handleSendSummary()}
        className={`${OverlayUi.btn.primary} w-full`}
      >
        {sendBusy ? t("ui_store_order_sending") : t("ui_store_order_send_summary")}
      </button>
      {sendSummaryDisabled ? (
        <p className="mt-2 text-center sam-text-helper text-amber-700">{t("ui_store_order_chat_send_blocked")}</p>
      ) : null}
      {sendToast ? (
        <p className="mt-2 text-center sam-text-body-secondary text-muted">{sendToast}</p>
      ) : null}
    </div>
  );

  const orderPreviewBlock = (
    <div className="px-3 py-3 sam-text-body text-foreground">
      {loading ? (
        <p className="text-center text-muted">{t("ui_store_order_loading")}</p>
      ) : loadErr ? (
        <p className="text-center text-red-600">{loadErr}</p>
      ) : orderSnap ? (
        <pre className="whitespace-pre-wrap break-words font-sans sam-text-body-secondary leading-[1.45] text-foreground">
          {formatStoreOrderSummaryForChatMessage(orderSnap, itemsSnap, "seller")}
        </pre>
      ) : null}
    </div>
  );

  const scrollBody = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sam-text-body text-foreground">
      {loading ? (
        <p className="text-center text-muted">{t("ui_store_order_loading")}</p>
      ) : loadErr ? (
        <p className="text-center text-red-600">{loadErr}</p>
      ) : orderSnap ? (
        <pre className="whitespace-pre-wrap break-words font-sans sam-text-body-secondary leading-[1.45] text-foreground">
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
          <div className="border-b border-sam-border px-3 py-3">
            <p className="mb-1 sam-text-xxs font-semibold uppercase tracking-wide text-muted">
              {t("ui_store_order_my_shop")}
            </p>
            <p className="mb-2 sam-text-helper leading-snug text-muted">
              {t("chats_seller_panel_hub_same_menu")}
            </p>
            <Link
              href={businessHubHref}
              onClick={() => onOpenChange(false)}
              className="flex w-full items-center justify-center rounded-ui-rect bg-foreground px-4 py-3 sam-text-body font-semibold text-[var(--sub-bg)] hover:bg-black"
            >
              {t("chats_seller_panel_go_my_store_cta")}
            </Link>
            <div className="mt-3">
              <MyBusinessNavList
                groups={businessNavGroups}
                onNavigate={() => onOpenChange(false)}
                className="rounded-ui-rect border border-sam-border bg-sam-primary-soft pb-2 shadow-none"
              />
            </div>
          </div>
          <div className="border-t border-sam-border px-0 pt-1">
            <p className="px-3 pt-3 sam-text-xxs font-semibold uppercase tracking-wide text-muted">
              {t("chats_seller_panel_this_chat_order")}
            </p>
            {!stackAboveOwnerChatModal ? deliverySection : null}
            <div className="border-b border-sam-border px-3 py-3">
              <button
                type="button"
                disabled={sendBusy || loading || !orderSnap || !!loadErr || sendSummaryDisabled}
                onClick={() => void handleSendSummary()}
                className={`${OverlayUi.btn.primary} w-full`}
              >
                {sendBusy ? t("ui_store_order_sending") : t("ui_store_order_send_summary")}
              </button>
              {sendSummaryDisabled ? (
                <p className="mt-2 text-center sam-text-helper text-amber-700">
                  {t("ui_store_order_chat_send_blocked")}
                </p>
              ) : null}
              {sendToast ? (
                <p className="mt-2 text-center sam-text-body-secondary text-muted">{sendToast}</p>
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
            <button
              type="button"
              className={`${OverlayUi.backdrop} !fixed ${dimZ} transition-opacity duration-300 ease-out ${
                open ? "pointer-events-auto !opacity-100" : "pointer-events-none !opacity-0"
              }`}
              onClick={() => onOpenChange(false)}
              aria-label={t("common_close")}
              aria-hidden={!open}
            />
            {presentation === "drawer" ? (
              <div
                id={surfaceId}
                className={`fixed top-0 right-0 ${surfaceZ} flex h-[100dvh] w-[min(100vw,22rem)] flex-col bg-sam-surface shadow-[-6px_0_24px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-out ${
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
                  className={`flex max-h-[min(90dvh,640px)] w-full max-w-lg flex-col rounded-t-[length:var(--overlay-radius-xl)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] pb-[var(--kb-safe-bottom,var(--safe-bottom,0px))] shadow-[var(--overlay-elevation-3)] sm:pb-0 transition-all duration-300 ease-out sm:rounded-[length:var(--overlay-radius-lg)] ${
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
