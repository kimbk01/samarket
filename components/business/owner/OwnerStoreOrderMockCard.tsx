"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, MessageSquare, Phone } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerOrderAcceptSheet } from "@/components/business/owner/OwnerOrderAcceptSheet";
import { OwnerOrderRejectSheet } from "@/components/business/owner/OwnerOrderRejectSheet";
import type { OwnerStoreOrderListRow } from "@/lib/business/owner-store-order-list-row-bridge";
import { formatOwnerOrderElapsed } from "@/components/business/owner/owner-order-elapsed";
import { ownerOrderStatusTone } from "@/lib/stores/owner-mobile-ui-tokens";
import {
  runOwnerStoreOrderCancelRequest,
  runOwnerStoreOrderPatch,
  type OwnerStoreOrderMutationCallbacks,
} from "@/lib/business/owner-store-order-mutation";
import {
  ownerOpsStatusLabelI18n,
  ownerReviewStatusLabelI18n,
  ownerRiderStatusLabelI18n,
} from "@/lib/stores/owner-order-ui-labels";
import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import { dispatchOwnerHubBadgeRefresh } from "@/lib/chats/chat-channel-events";
import { invalidateOwnerStoreOrdersListCache } from "@/lib/delivery/owner/owner-store-orders-list-cache";
import { forgetSingleFlight } from "@/lib/http/run-single-flight";
import { isDeliveryFulfillment } from "@/lib/stores/order-status-transitions";
import {
  isStoreOrderTerminalStatus,
  processFlowStepStates,
  processStatusLabel,
  processStepLabel,
  processSteps,
  type StoreOrderProcessStepKey,
} from "@/lib/stores/store-order-process-model";
import {
  ownerCancelActionButtonKey,
  resolveStoreOrderCancelPolicy,
} from "@/lib/stores/store-order-cancel-policy";
import { resolveOwnerNextOrderAction } from "@/lib/business/owner-order-stepper-transition";
import { formatMoneyPhp } from "@/lib/utils/format";
import { formatPhMobileDisplay, parsePhMobileInput, telHrefFromLoosePhPhone } from "@/lib/utils/ph-mobile";
import { formatBuyerPaymentDisplay } from "@/lib/stores/payment-methods-config";
import { formatStoreOrderDeliveryAddressPlain } from "@/lib/addresses/store-order-delivery-address-display";
import { orderLineOptionsSummary } from "@/lib/stores/product-line-options";
import {
  OwnerOrderItemFeedbackBadge,
  OwnerStoreOrderReviewBlock,
} from "@/components/business/owner/OwnerStoreOrderReviewBlock";
import { useOwnerStoreOrderReviewLoad } from "@/components/business/owner/use-owner-store-order-review-load";

const FULFILL_LABEL_KEYS = {
  pickup: "store_owner_fulfillment_pickup_short",
  local_delivery: "store_owner_fulfillment_delivery_short",
  shipping: "store_owner_fulfillment_delivery_short",
} as const;

const QUICK_REPLY_KEYS = [
  "store_owner_quick_reply_late",
  "store_owner_quick_reply_door",
  "store_owner_quick_reply_ingredients",
  "store_owner_quick_reply_call",
] as const;

export function OwnerStoreOrderMockCard({
  storeId,
  order,
  onUpdated,
  onPatchOrderRow,
  onReconcileOrder,
  onOrderStatusPatched,
  isHighlight,
  isExpanded,
  onToggleExpanded,
  onOpenChat,
}: {
  storeId: string;
  order: OwnerStoreOrderListRow;
  onUpdated: () => void | Promise<void>;
  onPatchOrderRow: OwnerStoreOrderMutationCallbacks["onPatchOrderRow"];
  onReconcileOrder?: OwnerStoreOrderMutationCallbacks["onReconcileOrder"];
  onOrderStatusPatched?: (orderId: string) => void;
  isHighlight: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onOpenChat: () => void;
}) {
  const { t, language } = useI18n();
  const tone = ownerOrderStatusTone(order.order_status);
  const deliveryLike = isDeliveryFulfillment(order.fulfillment_type);
  const statusLabel = ownerOpsStatusLabelI18n(language, order.order_status, order.fulfillment_type);
  const elapsed = formatOwnerOrderElapsed(order.created_at, language);
  const buyerLabel =
    typeof order.buyer_public_label === "string" && order.buyer_public_label.trim()
      ? order.buyer_public_label.trim()
      : t("store_buyer_public_label_fallback");
  const phoneRaw = typeof order.buyer_phone === "string" ? order.buyer_phone.trim() : "";
  const phoneDigits = phoneRaw ? parsePhMobileInput(phoneRaw) : "";
  const phoneDisplay =
    phoneRaw && phoneDigits.length === 11 ? formatPhMobileDisplay(phoneDigits) : phoneRaw;
  const phoneTel = phoneRaw ? telHrefFromLoosePhPhone(phoneRaw) : null;
  const address = formatStoreOrderDeliveryAddressPlain({
    summary: order.delivery_address_summary,
    detail: order.delivery_address_detail,
  });
  const menuSummary = summarizeMenu(order.items, t);
  const nextAction = resolveOwnerNextOrderAction(order.order_status, order.fulfillment_type, language);
  const cancelPolicy = useMemo(
    () =>
      resolveStoreOrderCancelPolicy({
        role: "owner",
        orderStatus: order.order_status,
        paymentStatus: order.payment_status,
        deliveryStatus: order.delivery?.delivery_status ?? null,
      }),
    [order.delivery?.delivery_status, order.order_status, order.payment_status]
  );
  const cancelButtonKey = ownerCancelActionButtonKey(cancelPolicy);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const showReviewSection =
    isExpanded &&
    order.order_status === "completed" &&
    order.review_status !== "not_applicable";

  const {
    review: orderReview,
    loading: reviewLoading,
    loadErr: reviewLoadErr,
    setReview: setOrderReview,
  } = useOwnerStoreOrderReviewLoad({
    storeId,
    orderId: order.id,
    reviewStatus: order.review_status,
    enabled: showReviewSection,
  });

  const mutationCallbacks = useMemo(
    (): OwnerStoreOrderMutationCallbacks => ({
      onPatchOrderRow,
      onReconcileOrder,
    }),
    [onPatchOrderRow, onReconcileOrder]
  );

  useEffect(() => {
    setErr(null);
  }, [order.id, order.order_status]);

  const afterMutationSuccess = useCallback(
    async (nextStatus: string) => {
      dispatchOwnerHubBadgeRefresh({
        source: "owner-order-ops-card",
        key: `${storeId}:${order.id}:${nextStatus}`,
      });
      invalidateOwnerStoreOrdersListCache(storeId);
      forgetSingleFlight(`me:store:${storeId}:orders:fresh`);
      forgetSingleFlight(`me:store:${storeId}:orders`);
      onOrderStatusPatched?.(order.id);
      await onReconcileOrder?.(order.id);
      await onUpdated();
    },
    [onOrderStatusPatched, onReconcileOrder, onUpdated, order.id, storeId]
  );

  const runPatch = useCallback(
    async (nextStatus: string, estimatedPrepMinutes?: number) => {
      setBusy(nextStatus);
      setErr(null);
      try {
        const res = await runOwnerStoreOrderPatch(
          storeId,
          order.id,
          {
            order_status: nextStatus,
            ...(estimatedPrepMinutes != null ? { estimated_prep_minutes: estimatedPrepMinutes } : {}),
          },
          language,
          mutationCallbacks
        );
        if (!res.ok) {
          setErr(res.displayMessage);
          return false;
        }
        await afterMutationSuccess(res.order_status);
        return true;
      } catch {
        setErr(t("store_owner_network_patch_failed"));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [afterMutationSuccess, language, mutationCallbacks, order.id, storeId, t]
  );

  const onPrimaryAction = useCallback(() => {
    if (!nextAction || busy) return;
    if (nextAction.status === "accepted") {
      setAcceptOpen(true);
      return;
    }
    void runPatch(nextAction.status);
  }, [busy, nextAction, runPatch]);

  const onReject = useCallback(() => {
    if (busy || !cancelButtonKey) return;
    setRejectOpen(true);
  }, [busy, cancelButtonKey]);

  const confirmAccept = useCallback(
    (minutes: number) => {
      void runPatch("accepted", minutes).then((ok) => {
        if (ok) setAcceptOpen(false);
      });
    },
    [runPatch]
  );

  const confirmReject = useCallback(
    (reason: string) => {
      const busyKey = cancelPolicy.kind === "request_cancel" ? "cancel_requested" : "cancelled";
      setBusy(busyKey);
      setErr(null);
      void runOwnerStoreOrderCancelRequest(storeId, order.id, { reason }, language, mutationCallbacks).then(
        async (res) => {
          if (!res.ok) {
            setErr(res.displayMessage);
            setBusy(null);
            return;
          }
          dispatchOwnerHubBadgeRefresh({
            source: "owner-order-ops-card-cancel",
            key: `${storeId}:${order.id}:${res.order_status}`,
          });
          invalidateOwnerStoreOrdersListCache(storeId);
          forgetSingleFlight(`me:store:${storeId}:orders:fresh`);
          forgetSingleFlight(`me:store:${storeId}:orders`);
          onOrderStatusPatched?.(order.id);
          await onReconcileOrder?.(order.id);
          await onUpdated();
          setBusy(null);
          setRejectOpen(false);
        }
      );
    },
    [
      cancelPolicy.kind,
      language,
      mutationCallbacks,
      onOrderStatusPatched,
      onReconcileOrder,
      onUpdated,
      order.id,
      storeId,
    ]
  );

  const flow = useMemo(
    () => buildOwnerOpsFlowFromModel(order.order_status, order.fulfillment_type, language),
    [language, order.fulfillment_type, order.order_status]
  );

  return (
    <li
      id={`owner-order-${order.id}`}
      className={`scroll-mt-48 overflow-hidden rounded-[4px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] shadow-sm ${
        isHighlight ? "ring-2 ring-[var(--biz-primary)] ring-offset-2" : ""
      }`}
    >
      <div className="p-3">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="block w-full touch-manipulation text-left [-webkit-tap-highlight-color:transparent]"
          aria-expanded={isExpanded}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex rounded-[4px] px-2 py-0.5 text-[12px] font-bold leading-[1.35] ${tone.badgeBg} ${tone.badgeText}`}
                >
                  {statusLabel}
                </span>
                <span className="inline-flex rounded-[4px] bg-[var(--biz-primary-soft)] px-1.5 py-0.5 text-[11px] font-semibold leading-[1.35] text-[var(--biz-text)]">
                  {t(FULFILL_LABEL_KEYS[order.fulfillment_type as keyof typeof FULFILL_LABEL_KEYS] ?? "store_owner_fulfillment_delivery_short")}
                </span>
                {elapsed ? (
                  <span className="text-[12px] font-medium leading-[1.35] text-[#6B7280]">{elapsed}</span>
                ) : null}
                {order.order_status === "completed" && order.review_status === "completed" ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-[4px] bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold leading-[1.35] text-amber-800 ring-1 ring-amber-200"
                    aria-label={t("store_owner_order_review_card_badge_aria")}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                    {t("store_owner_order_review_card_badge")}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-[12px] font-semibold leading-[1.35] text-[#4B5B53]">{order.order_no}</p>
              <p className="mt-1 truncate text-[15px] font-bold leading-[1.35] text-[var(--biz-text)]">
                {buyerLabel}
              </p>
            </div>
            <ChevronDown
              className={`mt-1 h-5 w-5 shrink-0 text-[var(--biz-primary)] transition-transform duration-200 ${
                isExpanded ? "rotate-180" : ""
              }`}
              aria-hidden
            />
          </div>

          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <div className="min-w-0">
              {phoneDisplay ? (
                <p className="truncate text-[13px] font-medium leading-[1.35] text-[#4B5B53]">
                  {phoneDisplay}
                </p>
              ) : null}
              {address ? (
                <p className="mt-1 line-clamp-2 text-[13px] leading-[1.35] text-[#4B5B53]">{address}</p>
              ) : null}
              <p className="mt-1 line-clamp-1 text-[12px] leading-[1.35] text-[#6B7280]">{menuSummary}</p>
            </div>
            <div className="text-right">
              <p className="text-[18px] font-bold leading-[1.2] tabular-nums text-[var(--biz-text)]">
                {formatMoneyPhp(order.payment_amount)}
              </p>
              <p className="mt-1 text-[11px] leading-[1.35] text-[#6B7280]">
                {new Date(order.created_at).toLocaleString(language === "ko" ? "ko-KR" : "en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
              </p>
            </div>
          </div>
        </button>

        <OwnerOpsProgressFlow steps={flow} />

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpanded();
            }}
            className="flex min-h-10 flex-1 items-center justify-center rounded-[4px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-3 text-[13px] font-bold leading-[1.35] text-[var(--biz-text)]"
          >
            {isExpanded ? t("store_owner_card_collapse") : t("store_owner_card_expand")}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenChat();
            }}
            className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-[4px] border border-[var(--biz-primary)] bg-[var(--biz-primary-soft)] px-3 text-[13px] font-bold leading-[1.35] text-[var(--biz-primary)]"
          >
            <MessageSquare className="h-4 w-4" aria-hidden />
            {t("store_owner_card_chat")}
          </button>
        </div>

        {err ? (
          <p className="mt-2 rounded-[4px] bg-red-50 px-2 py-1.5 text-[12px] font-medium leading-[1.35] text-red-700">
            {err}
          </p>
        ) : null}

        {(nextAction || cancelButtonKey) ? (
          <div className="mt-3 flex gap-2">
            {cancelButtonKey ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={onReject}
                className="flex min-h-11 flex-1 items-center justify-center rounded-[4px] border border-[#D14545] bg-white px-3 text-[14px] font-bold leading-[1.35] text-[#B42318] disabled:opacity-50"
              >
                {t(cancelButtonKey)}
              </button>
            ) : null}
            {nextAction ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={onPrimaryAction}
                className="flex min-h-11 flex-[1.25] items-center justify-center rounded-[4px] bg-[var(--biz-primary)] px-3 text-[14px] font-bold leading-[1.35] text-white shadow-sm active:bg-[var(--biz-primary-active)] disabled:opacity-50"
              >
                {busy === nextAction.status ? t("common_processing") : nextAction.label}
              </button>
            ) : null}
          </div>
        ) : null}

        {isExpanded ? (
          <div className="mt-3 space-y-3 border-t-2 border-[var(--biz-primary)] bg-[var(--biz-primary-soft)] px-3 pb-3 pt-3">
            <OwnerOpsSection title={t("store_owner_order_menu_section")}>
              <div className="space-y-2">
                {order.items.length > 0 ? (
                  order.items.map((it) => (
                    <div key={it.id} className="rounded-[4px] bg-[#f6f6f6] px-2.5 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-[13px] font-bold leading-[1.35] text-[var(--biz-text)]">
                              {it.product_title_snapshot} x {it.qty}
                            </p>
                            {orderReview?.item_feedback?.[it.id] ? (
                              <OwnerOrderItemFeedbackBadge vote={orderReview.item_feedback[it.id]} />
                            ) : null}
                          </div>
                          {orderLineOptionsSummary(it.options_snapshot_json) ? (
                            <p className="mt-0.5 text-[12px] leading-[1.35] text-[#6B7280]">
                              {orderLineOptionsSummary(it.options_snapshot_json)}
                            </p>
                          ) : null}
                        </div>
                        <p className="shrink-0 text-[13px] font-bold leading-[1.35] text-[var(--biz-text)]">
                          {formatMoneyPhp(it.subtotal || it.price_snapshot * it.qty)}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[13px] leading-[1.35] text-[#6B7280]">{t("store_owner_no_menu_info")}</p>
                )}
              </div>
            </OwnerOpsSection>

            <OwnerOpsSection title={t("store_request_note")}>
              <p className="text-[13px] leading-[1.45] text-[var(--biz-text)]">
                {order.buyer_note?.trim() || t("store_owner_no_request_note")}
              </p>
            </OwnerOpsSection>

            <OwnerOpsSection title={deliveryLike ? t("store_owner_delivery_info_section") : t("store_owner_pickup_info_section")}>
              <div className="space-y-1.5 text-[13px] leading-[1.45] text-[var(--biz-text)]">
                <p>{deliveryLike ? address || t("store_owner_no_address") : t("store_owner_pickup_order_hint")}</p>
                <p className="text-[#6B7280]">
                  {t("store_owner_est_prep_line", {
                    prep: order.estimated_prep_minutes
                      ? t("store_owner_prep_about_minutes", { minutes: String(order.estimated_prep_minutes) })
                      : t("store_owner_est_prep_unknown"),
                  })}
                  {order.checkout_eta_minutes
                    ? t("store_owner_est_arrival_suffix", { minutes: String(order.checkout_eta_minutes) })
                    : ""}
                </p>
                {order.delivery?.delivery_status ? (
                  <p className="text-[var(--biz-primary)]">
                    {t("store_owner_rider_status_line", {
                      status: deliveryStatusLabel(order.delivery.delivery_status, language),
                    })}
                  </p>
                ) : null}
              </div>
            </OwnerOpsSection>

            <OwnerOpsSection title={t("store_owner_payment_review_section")}>
              <div className="grid grid-cols-2 gap-2 text-[12px] leading-[1.35]">
                <InfoPill label={t("store_owner_payment_method_label")} value={formatBuyerPaymentDisplay(order.buyer_payment_method, order.buyer_payment_method_detail)} />
                <InfoPill label={t("store_owner_payment_amount_label")} value={formatMoneyPhp(order.payment_amount)} />
                <InfoPill label={t("store_owner_label_review_short")} value={reviewStatusLabel(order.review_status, language)} />
                <InfoPill label={t("store_owner_label_receipt")} value={order.order_no} />
              </div>
            </OwnerOpsSection>

            {showReviewSection ? (
              <OwnerStoreOrderReviewBlock
                storeId={storeId}
                reviewStatus={order.review_status}
                enabled={showReviewSection}
                review={orderReview}
                loading={reviewLoading}
                loadErr={reviewLoadErr}
                onReviewChange={setOrderReview}
              />
            ) : null}

            <OwnerOpsSection title={t("store_owner_order_progress_chat_title")}>
              <div className="rounded-[4px] border border-[var(--biz-card-border)] bg-[var(--biz-primary-soft)] p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold leading-[1.35] text-[var(--biz-text)]">
                      {t("store_owner_ops_order_chat_label")}
                    </p>
                    <p className="mt-0.5 text-[12px] leading-[1.35] text-[#6B7280]">
                      {t("store_owner_status_auto_log")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenChat();
                    }}
                    className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-[4px] bg-[var(--biz-primary)] px-3 text-[12px] font-bold text-white"
                  >
                    <MessageSquare className="h-4 w-4" aria-hidden />
                    {t("store_owner_open_btn")}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {QUICK_REPLY_KEYS.map((key) => (
                    <span key={key} className="rounded-[4px] bg-[var(--biz-card-bg)] px-2 py-1 text-[11px] font-semibold text-[var(--biz-primary)] ring-1 ring-[var(--biz-card-border)]">
                      {t(key)}
                    </span>
                  ))}
                </div>
              </div>
            </OwnerOpsSection>

            {phoneTel ? (
              <a
                href={phoneTel}
                className="flex min-h-11 items-center justify-center gap-2 rounded-[4px] border border-[var(--biz-primary)] bg-[var(--biz-card-bg)] text-[14px] font-bold text-[var(--biz-primary)]"
              >
                <Phone className="h-4 w-4" aria-hidden />
                {t("store_owner_call_buyer")}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      <OwnerOrderAcceptSheet
        open={acceptOpen}
        busy={busy === "accepted"}
        onClose={() => {
          if (!busy) setAcceptOpen(false);
        }}
        onConfirm={confirmAccept}
        overlayClassName="z-[95]"
      />
      <OwnerOrderRejectSheet
        open={rejectOpen}
        busy={busy === "cancelled" || busy === "cancel_requested"}
        onClose={() => {
          if (!busy) setRejectOpen(false);
        }}
        onConfirm={confirmReject}
        title={
          cancelPolicy.kind === "request_cancel"
            ? t("store_owner_cancel_request_sheet_title")
            : t("store_owner_cancel_sheet_title")
        }
        description={
          cancelPolicy.kind === "request_cancel"
            ? t("store_owner_cancel_request_sheet_desc")
            : t("store_owner_cancel_sheet_desc")
        }
        confirmLabel={cancelButtonKey ? t(cancelButtonKey) : undefined}
      />
    </li>
  );
}

function summarizeMenu(
  items: OwnerStoreOrderListRow["items"],
  t: (key: MessageKey, vars?: Record<string, string>) => string
): string {
  if (!items.length) return t("store_owner_menu_summary_none");
  const [first] = items;
  const extra = items.length - 1;
  if (!first) return t("store_owner_menu_summary_none");
  return t("store_owner_menu_summary_line", {
    title: first.product_title_snapshot,
    qty: String(first.qty),
    extra: extra > 0 ? t("store_owner_menu_summary_extra", { count: String(extra) }) : "",
  });
}

type FlowStep = { label: string; state: "done" | "current" | "upcoming" };

function buildOwnerOpsFlowFromModel(status: string, fulfillment: string, lang: AppLanguageCode): FlowStep[] {
  if (isStoreOrderTerminalStatus(status)) {
    const terminalLabel = processStatusLabel(status, fulfillment, "owner_badge", lang);
    return [{ label: terminalLabel, state: "current" }];
  }
  const keys = processSteps(fulfillment);
  const states = processFlowStepStates(fulfillment, status);
  return keys.map((key, i) => ({
    label: processStepLabel(key as StoreOrderProcessStepKey, fulfillment, "owner", lang),
    state: states[i] ?? "upcoming",
  }));
}

function deliveryStatusLabel(status: string, lang: AppLanguageCode): string {
  return ownerRiderStatusLabelI18n(lang, status);
}

function reviewStatusLabel(status: OwnerStoreOrderListRow["review_status"], lang: AppLanguageCode): string {
  return ownerReviewStatusLabelI18n(lang, status ?? "");
}

function OwnerOpsProgressFlow({ steps }: { steps: FlowStep[] }) {
  return (
    <ol className="mt-3 grid list-none gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((step, i) => (
        <li key={`${step.label}-${i}`} className="min-w-0">
          <div
            className={`h-1.5 rounded-full ${
              step.state === "done"
                ? "bg-[var(--biz-text)]"
                : step.state === "current"
                  ? "bg-[var(--biz-primary)]"
                  : "bg-[var(--biz-card-border)]"
            }`}
          />
          <p
            className={`mt-1 truncate text-center text-[10px] font-semibold leading-[1.25] ${
              step.state === "upcoming" ? "text-[#9CA3AF]" : "text-[var(--biz-text)]"
            }`}
          >
            {step.label}
          </p>
        </li>
      ))}
    </ol>
  );
}

function OwnerOpsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[4px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] p-3">
      <h3 className="mb-2 border-l-4 border-[var(--biz-primary)] pl-2 text-[12px] font-bold leading-[1.35] text-[var(--biz-primary)]">{title}</h3>
      {children}
    </section>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[4px] bg-[#f6f6f6] p-2">
      <p className="text-[11px] font-semibold text-[#6B7280]">{label}</p>
      <p className="mt-0.5 truncate text-[12px] font-bold text-[var(--biz-text)]">{value}</p>
    </div>
  );
}
