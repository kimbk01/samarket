"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, MessageSquare, Phone } from "lucide-react";
import { OwnerOrderAcceptSheet } from "@/components/business/owner/OwnerOrderAcceptSheet";
import { OwnerOrderRejectSheet } from "@/components/business/owner/OwnerOrderRejectSheet";
import type { OwnerStoreOrderListRow } from "@/lib/business/owner-store-order-list-row-bridge";
import { formatOwnerOrderElapsedKo } from "@/components/business/owner/owner-order-elapsed";
import { ownerOrderStatusLabelKo, ownerOrderStatusTone } from "@/lib/stores/owner-mobile-ui-tokens";
import { dispatchOwnerHubBadgeRefresh } from "@/lib/chats/chat-channel-events";
import { patchOwnerStoreOrderStatus } from "@/lib/business/patch-owner-store-order-status";
import { invalidateOwnerStoreOrdersListCache } from "@/lib/stores/owner-store-orders-list-cache";
import {
  isDeliveryFulfillment,
} from "@/lib/stores/order-status-transitions";
import { resolveOwnerNextOrderAction } from "@/lib/business/owner-order-stepper-transition";
import { formatMoneyPhp } from "@/lib/utils/format";
import { formatPhMobileDisplay, parsePhMobileInput, telHrefFromLoosePhPhone } from "@/lib/utils/ph-mobile";
import { BUYER_PUBLIC_LABEL_FALLBACK } from "@/lib/stores/buyer-public-label";
import { formatBuyerPaymentDisplay } from "@/lib/stores/payment-methods-config";
import { formatStoreOrderDeliveryAddressPlain } from "@/lib/addresses/store-order-delivery-address-display";
import { orderLineOptionsSummary } from "@/lib/stores/product-line-options";

const FULFILL_LABEL: Record<string, string> = {
  pickup: "포장",
  local_delivery: "배달",
  shipping: "배달",
};

export function OwnerStoreOrderMockCard({
  storeId,
  order,
  onUpdated,
  onOrderStatusPatched,
  isHighlight,
  isExpanded,
  onToggleExpanded,
  onOpenChat,
}: {
  storeId: string;
  order: OwnerStoreOrderListRow;
  onUpdated: () => void | Promise<void>;
  onOrderStatusPatched?: (orderId: string) => void;
  isHighlight: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onOpenChat: () => void;
}) {
  const tone = ownerOrderStatusTone(order.order_status);
  const deliveryLike = isDeliveryFulfillment(order.fulfillment_type);
  const statusLabel = ownerOpsStatusLabel(order.order_status, order.fulfillment_type);
  const elapsed = formatOwnerOrderElapsedKo(order.created_at);
  const buyerLabel =
    typeof order.buyer_public_label === "string" && order.buyer_public_label.trim()
      ? order.buyer_public_label.trim()
      : BUYER_PUBLIC_LABEL_FALLBACK;
  const phoneRaw = typeof order.buyer_phone === "string" ? order.buyer_phone.trim() : "";
  const phoneDigits = phoneRaw ? parsePhMobileInput(phoneRaw) : "";
  const phoneDisplay =
    phoneRaw && phoneDigits.length === 11 ? formatPhMobileDisplay(phoneDigits) : phoneRaw;
  const phoneTel = phoneRaw ? telHrefFromLoosePhPhone(phoneRaw) : null;
  const address = formatStoreOrderDeliveryAddressPlain({
    summary: order.delivery_address_summary,
    detail: order.delivery_address_detail,
  });
  const menuSummary = summarizeMenu(order.items);
  const nextAction = resolveOwnerNextOrderAction(order.order_status, order.fulfillment_type);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const runPatch = useCallback(
    async (nextStatus: string, estimatedPrepMinutes?: number) => {
      setBusy(nextStatus);
      setErr(null);
      try {
        const res = await patchOwnerStoreOrderStatus(storeId, order.id, {
          order_status: nextStatus,
          ...(estimatedPrepMinutes != null ? { estimated_prep_minutes: estimatedPrepMinutes } : {}),
        });
        if (!res.ok) {
          setErr(formatOwnerOpsPatchErr(res.error ?? "update_failed"));
          return false;
        }
        dispatchOwnerHubBadgeRefresh({
          source: "owner-order-ops-card",
          key: `${storeId}:${order.id}:${nextStatus}`,
        });
        invalidateOwnerStoreOrdersListCache(storeId);
        onOrderStatusPatched?.(order.id);
        await onUpdated();
        return true;
      } catch {
        setErr("네트워크 오류로 처리하지 못했습니다.");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [onOrderStatusPatched, onUpdated, order.id, storeId]
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
    if (busy) return;
    setRejectOpen(true);
  }, [busy]);

  const confirmAccept = useCallback(
    (minutes: number) => {
      void runPatch("accepted", minutes).then((ok) => {
        if (ok) setAcceptOpen(false);
      });
    },
    [runPatch]
  );

  const confirmReject = useCallback(
    (_reason: string) => {
      void runPatch("cancelled").then((ok) => {
        if (ok) setRejectOpen(false);
      });
    },
    [runPatch]
  );

  const flow = useMemo(
    () => buildOwnerOpsFlow(order.order_status, order.fulfillment_type),
    [order.fulfillment_type, order.order_status]
  );

  return (
    <li
      id={`owner-order-${order.id}`}
      className={`scroll-mt-48 overflow-hidden rounded-[4px] border border-[#DDE5E0] bg-white shadow-sm ${
        isHighlight ? "ring-2 ring-[#1C8DB8] ring-offset-2" : ""
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
                <span className="inline-flex rounded-[4px] bg-[#EAF6FB] px-1.5 py-0.5 text-[11px] font-semibold leading-[1.35] text-[#123B4A]">
                  {FULFILL_LABEL[order.fulfillment_type] ?? order.fulfillment_type}
                </span>
                {elapsed ? (
                  <span className="text-[12px] font-medium leading-[1.35] text-[#6B7280]">{elapsed}</span>
                ) : null}
              </div>
              <p className="mt-2 text-[12px] font-semibold leading-[1.35] text-[#4B5B53]">{order.order_no}</p>
              <p className="mt-1 truncate text-[15px] font-bold leading-[1.35] text-[#123B4A]">
                {buyerLabel}
              </p>
            </div>
            <ChevronDown
              className={`mt-1 h-5 w-5 shrink-0 text-[#1C8DB8] transition-transform duration-200 ${
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
              <p className="text-[18px] font-bold leading-[1.2] tabular-nums text-[#123B4A]">
                {formatMoneyPhp(order.payment_amount)}
              </p>
              <p className="mt-1 text-[11px] leading-[1.35] text-[#6B7280]">
                {new Date(order.created_at).toLocaleString("ko-KR", {
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
            onClick={onToggleExpanded}
            className="flex min-h-10 flex-1 items-center justify-center rounded-[4px] border border-[#DDE5E0] bg-white px-3 text-[13px] font-bold leading-[1.35] text-[#123B4A]"
          >
            {isExpanded ? "접기" : "주문 펼치기"}
          </button>
          <button
            type="button"
            onClick={onOpenChat}
            className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-[4px] border border-[#1C8DB8] bg-[#EAF6FB] px-3 text-[13px] font-bold leading-[1.35] text-[#1C8DB8]"
          >
            <MessageSquare className="h-4 w-4" aria-hidden />
            채팅
          </button>
        </div>

        {err ? (
          <p className="mt-2 rounded-[4px] bg-red-50 px-2 py-1.5 text-[12px] font-medium leading-[1.35] text-red-700">
            {err}
          </p>
        ) : null}

        {nextAction ? (
          <div className="mt-3 flex gap-2">
            {order.order_status === "pending" ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={onReject}
                className="flex min-h-11 flex-1 items-center justify-center rounded-[4px] border border-[#D14545] bg-white px-3 text-[14px] font-bold leading-[1.35] text-[#B42318] disabled:opacity-50"
              >
                주문 거절
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy !== null}
              onClick={onPrimaryAction}
              className="flex min-h-11 flex-[1.25] items-center justify-center rounded-[4px] bg-[#1C8DB8] px-3 text-[14px] font-bold leading-[1.35] text-white shadow-sm active:bg-[#166F93] disabled:opacity-50"
            >
              {busy === nextAction.status ? "처리 중…" : nextAction.label}
            </button>
          </div>
        ) : null}

        {isExpanded ? (
          <div className="mt-3 space-y-3 border-t-2 border-[#1C8DB8] bg-[#F6FAFC] px-3 pb-3 pt-3">
            <OwnerOpsSection title="주문 메뉴">
              <div className="space-y-2">
                {order.items.length > 0 ? (
                  order.items.map((it) => (
                    <div key={it.id} className="rounded-[4px] bg-[#f6f6f6] px-2.5 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold leading-[1.35] text-[#123B4A]">
                            {it.product_title_snapshot} x {it.qty}
                          </p>
                          {orderLineOptionsSummary(it.options_snapshot_json) ? (
                            <p className="mt-0.5 text-[12px] leading-[1.35] text-[#6B7280]">
                              {orderLineOptionsSummary(it.options_snapshot_json)}
                            </p>
                          ) : null}
                        </div>
                        <p className="shrink-0 text-[13px] font-bold leading-[1.35] text-[#123B4A]">
                          {formatMoneyPhp(it.subtotal || it.price_snapshot * it.qty)}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[13px] leading-[1.35] text-[#6B7280]">메뉴 정보가 없습니다.</p>
                )}
              </div>
            </OwnerOpsSection>

            <OwnerOpsSection title="요청사항">
              <p className="text-[13px] leading-[1.45] text-[#123B4A]">
                {order.buyer_note?.trim() || "요청사항 없음"}
              </p>
            </OwnerOpsSection>

            <OwnerOpsSection title={deliveryLike ? "배달 정보" : "픽업 정보"}>
              <div className="space-y-1.5 text-[13px] leading-[1.45] text-[#123B4A]">
                <p>{deliveryLike ? address || "주소 정보 없음" : "고객 픽업 주문입니다."}</p>
                <p className="text-[#6B7280]">
                  예상 준비시간 {order.estimated_prep_minutes ? `약 ${order.estimated_prep_minutes}분` : "미정"}
                  {order.checkout_eta_minutes ? ` · 예상 도착 ${order.checkout_eta_minutes}분` : ""}
                </p>
                {order.delivery?.delivery_status ? (
                  <p className="text-[#1C8DB8]">라이더 상태: {deliveryStatusLabel(order.delivery.delivery_status)}</p>
                ) : null}
              </div>
            </OwnerOpsSection>

            <OwnerOpsSection title="결제·리뷰">
              <div className="grid grid-cols-2 gap-2 text-[12px] leading-[1.35]">
                <InfoPill label="결제" value={formatBuyerPaymentDisplay(order.buyer_payment_method, order.buyer_payment_method_detail)} />
                <InfoPill label="금액" value={formatMoneyPhp(order.payment_amount)} />
                <InfoPill label="리뷰" value={reviewStatusLabel(order.review_status)} />
                <InfoPill label="영수증" value={order.order_no} />
              </div>
            </OwnerOpsSection>

            <OwnerOpsSection title="주문 진행 채팅">
              <div className="rounded-[4px] border border-[#DDE5E0] bg-[#F6FAFC] p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold leading-[1.35] text-[#123B4A]">운영형 주문 채팅</p>
                    <p className="mt-0.5 text-[12px] leading-[1.35] text-[#6B7280]">
                      상태 변경은 시스템 메시지로 자동 기록됩니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenChat}
                    className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-[4px] bg-[#1C8DB8] px-3 text-[12px] font-bold text-white"
                  >
                    <MessageSquare className="h-4 w-4" aria-hidden />
                    열기
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {["조금 늦어집니다", "문앞 배달 예정", "재료 확인중", "전화 부탁드립니다"].map((quick) => (
                    <span key={quick} className="rounded-[4px] bg-white px-2 py-1 text-[11px] font-semibold text-[#1C8DB8] ring-1 ring-[#DDE5E0]">
                      {quick}
                    </span>
                  ))}
                </div>
              </div>
            </OwnerOpsSection>

            {phoneTel ? (
              <a
                href={phoneTel}
                className="flex min-h-11 items-center justify-center gap-2 rounded-[4px] border border-[#1C8DB8] bg-white text-[14px] font-bold text-[#1C8DB8]"
              >
                <Phone className="h-4 w-4" aria-hidden />
                주문자 전화
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
        busy={busy === "cancelled"}
        onClose={() => {
          if (!busy) setRejectOpen(false);
        }}
        onConfirm={confirmReject}
      />
    </li>
  );
}

function summarizeMenu(items: OwnerStoreOrderListRow["items"]): string {
  if (!items.length) return "메뉴 정보 없음";
  const [first] = items;
  const extra = items.length - 1;
  if (!first) return "메뉴 정보 없음";
  return `${first.product_title_snapshot} × ${first.qty}${extra > 0 ? ` 외 ${extra}개` : ""}`;
}

function ownerOpsStatusLabel(status: string, fulfillment: string): string {
  const deliveryLike = isDeliveryFulfillment(fulfillment);
  if (status === "ready_for_pickup") return deliveryLike ? "배달준비완료" : "픽업준비완료";
  if (status === "completed") return deliveryLike ? "배달완료" : "수령완료";
  return ownerOrderStatusLabelKo(status);
}

function formatOwnerOpsPatchErr(code: string): string {
  switch (code) {
    case "prep_minutes_required":
      return "예상 준비 시간(1-180분)을 선택해 주세요.";
    case "invalid_transition":
      return "현재 단계에서는 이 처리를 할 수 없습니다.";
    case "order_admin_locked":
      return "플랫폼에서 잠근 주문입니다. 운영센터 확인이 필요합니다.";
    default:
      return code;
  }
}

type FlowStep = { label: string; state: "done" | "current" | "upcoming" };

function buildOwnerOpsFlow(status: string, fulfillment: string): FlowStep[] {
  const deliveryLike = isDeliveryFulfillment(fulfillment);
  const keys = deliveryLike
    ? ["pending", "accepted", "preparing", "ready_for_pickup", "delivering", "arrived", "completed"]
    : ["pending", "accepted", "preparing", "ready_for_pickup", "completed"];
  const labels = deliveryLike
    ? ["신규주문", "주문접수", "조리중", "배달준비", "배달중", "주소근처", "완료"]
    : ["신규주문", "주문접수", "조리중", "픽업준비", "수령완료"];
  const current = keys.includes(status) ? keys.indexOf(status) : -1;
  return keys.map((key, i) => ({
    label: labels[i] ?? key,
    state: current < 0 ? "upcoming" : i < current ? "done" : i === current ? "current" : "upcoming",
  }));
}

function OwnerOpsProgressFlow({ steps }: { steps: FlowStep[] }) {
  return (
    <ol className="mt-3 grid list-none gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((step, i) => (
        <li key={`${step.label}-${i}`} className="min-w-0">
          <div
            className={`h-1.5 rounded-full ${
              step.state === "done"
                ? "bg-[#123B4A]"
                : step.state === "current"
                  ? "bg-[#1C8DB8]"
                  : "bg-[#DDE5E0]"
            }`}
          />
          <p
            className={`mt-1 truncate text-center text-[10px] font-semibold leading-[1.25] ${
              step.state === "upcoming" ? "text-[#9CA3AF]" : "text-[#123B4A]"
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
    <section className="rounded-[4px] border border-[#DDE5E0] bg-white p-3">
      <h3 className="mb-2 border-l-4 border-[#1C8DB8] pl-2 text-[12px] font-bold leading-[1.35] text-[#1C8DB8]">{title}</h3>
      {children}
    </section>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[4px] bg-[#f6f6f6] p-2">
      <p className="text-[11px] font-semibold text-[#6B7280]">{label}</p>
      <p className="mt-0.5 truncate text-[12px] font-bold text-[#123B4A]">{value}</p>
    </div>
  );
}

function deliveryStatusLabel(status: string): string {
  switch (status) {
    case "waiting_rider":
      return "라이더 대기";
    case "rider_assigned":
      return "라이더 배정";
    case "pickup_in_progress":
      return "픽업 진행";
    case "delivering":
      return "배달중";
    case "delivered":
      return "배달 완료";
    case "delivery_failed":
      return "배달 문제";
    default:
      return status;
  }
}

function reviewStatusLabel(status: OwnerStoreOrderListRow["review_status"]): string {
  switch (status) {
    case "pending":
      return "리뷰 대기";
    case "completed":
      return "리뷰 완료";
    case "unavailable":
      return "확인 불가";
    default:
      return "해당 없음";
  }
}
