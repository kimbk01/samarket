"use client";

import { useState, useMemo, type ReactNode } from "react";
import { allowedOrderTransitions } from "@/lib/stores/order-status-transitions";
import {
  BUYER_ORDER_STATUS_LABEL,
  labelForOwnerTransition,
} from "@/lib/stores/store-order-process-criteria";
import { KASAMA_OWNER_HUB_BADGE_REFRESH } from "@/lib/chats/chat-channel-events";

const BTN_PRIMARY =
  "flex min-h-[3rem] min-w-0 flex-1 items-center justify-center rounded-lg bg-signature px-2 py-2 text-center text-[13px] font-medium leading-snug text-white [overflow-wrap:anywhere] [word-break:break-word] disabled:opacity-50 sm:min-h-[2.75rem] sm:min-w-[6rem] sm:px-2.5 sm:py-2 sm:text-[14px]";
const BTN_DANGER =
  "flex min-h-[3rem] min-w-0 flex-1 items-center justify-center rounded-lg border border-red-200 bg-white px-2 py-2 text-center text-[13px] font-medium leading-snug text-red-700 [overflow-wrap:anywhere] [word-break:break-word] disabled:opacity-50 sm:min-h-[2.75rem] sm:min-w-[6rem] sm:px-2.5 sm:py-2 sm:text-[14px]";
const OC_SM =
  "text-[13px] font-normal leading-snug text-gray-500 [overflow-wrap:anywhere] [word-break:break-word]";

const TB_BTN_PRIMARY =
  "flex min-h-9 min-w-0 flex-1 items-center justify-center rounded-lg bg-signature px-2 py-1.5 text-center text-[12px] font-semibold leading-snug text-white [overflow-wrap:anywhere] [word-break:break-word] disabled:opacity-50";
const TB_BTN_DANGER =
  "flex min-h-9 min-w-0 flex-1 items-center justify-center rounded-lg border border-red-200 bg-white px-2 py-1.5 text-center text-[12px] font-semibold leading-snug text-red-700 [overflow-wrap:anywhere] [word-break:break-word] disabled:opacity-50";

export type OwnerDeliveryOrderRef = {
  id: string;
  order_status: string;
  fulfillment_type: string;
};

export function ownerOrderHasTransitionButtons(order: OwnerDeliveryOrderRef): boolean {
  const next = allowedOrderTransitions(order.order_status, order.fulfillment_type);
  return (
    order.order_status !== "refund_requested" &&
    order.order_status !== "refunded" &&
    next.length > 0
  );
}

function usePatchOrder(storeId: string, order: OwnerDeliveryOrderRef, onUpdated: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const patch = async (status: string) => {
    setErr(null);
    setBusy(status);
    try {
      const res = await fetch(
        `/api/me/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(order.id)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_status: status }),
        }
      );
      const j = await res.json();
      if (!j?.ok) {
        setErr(typeof j?.error === "string" ? j.error : "update_failed");
        return;
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(KASAMA_OWNER_HUB_BADGE_REFRESH));
      }
      onUpdated();
    } catch {
      setErr("network_error");
    } finally {
      setBusy(null);
    }
  };

  return { busy, err, patch };
}

/** 주문 카드: `aside` = 회색 박스 오른쪽 열, `rowBelow` = 카드 하단 전체 폭 */
export function OwnerStoreOrderDeliveryActionsAside({
  storeId,
  order,
  onUpdated,
  variant = "aside",
}: {
  storeId: string;
  order: OwnerDeliveryOrderRef;
  onUpdated: () => void;
  variant?: "aside" | "rowBelow";
}) {
  const next = allowedOrderTransitions(order.order_status, order.fulfillment_type);
  const showTransitionButtons =
    order.order_status !== "refund_requested" &&
    order.order_status !== "refunded" &&
    next.length > 0;
  const { busy, err, patch } = usePatchOrder(storeId, order, onUpdated);

  if (!showTransitionButtons) return null;

  const wrapClass =
    variant === "rowBelow"
      ? "flex w-full min-w-0 flex-col justify-center gap-2"
      : "flex min-w-0 max-w-[min(100%,13.25rem)] flex-col justify-center justify-self-end gap-2 sm:max-w-none";

  return (
    <div className={wrapClass}>
      {err ? (
        <p className="max-w-full text-left text-[11px] leading-snug text-red-600 [overflow-wrap:anywhere] [word-break:break-word]">
          {err}
        </p>
      ) : null}
      <div className="flex min-w-0 flex-row flex-nowrap gap-2 sm:gap-2">
        {next.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy !== null}
            onClick={() => void patch(s)}
            className={s === "cancelled" ? BTN_DANGER : BTN_PRIMARY}
          >
            {busy === s
              ? "처리 중…"
              : labelForOwnerTransition(order.order_status, s, order.fulfillment_type)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 채팅 주문 패널: 배달 진행·주문취소 + 안내 (모달 안에서 채팅 병행) */
export function OwnerStoreOrderDeliveryActionsDrawerSection({
  storeId,
  order,
  onUpdated,
}: {
  storeId: string;
  order: OwnerDeliveryOrderRef;
  onUpdated: () => void;
}) {
  const next = allowedOrderTransitions(order.order_status, order.fulfillment_type);
  const showTransitionButtons =
    order.order_status !== "refund_requested" &&
    order.order_status !== "refunded" &&
    next.length > 0;
  const { busy, err, patch } = usePatchOrder(storeId, order, onUpdated);

  const noticeEl: ReactNode = useMemo(() => {
    if (order.order_status === "refund_requested") {
      return (
        <p className="rounded-lg border border-amber-100 bg-amber-50/80 px-2 py-2 text-[12px] leading-snug text-amber-950">
          구매자가 환불을 요청했습니다. 관리자 화면(배달 주문)에서 승인하면 재고·정산이 반영됩니다.
        </p>
      );
    }
    if (order.order_status === "refunded") {
      return <p className={OC_SM}>환불 처리된 주문입니다.</p>;
    }
    if (!showTransitionButtons) {
      return (
        <p className={`${OC_SM} text-gray-400`}>이 주문은 더 이상 상태를 바꿀 수 없습니다.</p>
      );
    }
    return null;
  }, [order.order_status, showTransitionButtons]);

  const statusLabel = BUYER_ORDER_STATUS_LABEL[order.order_status] ?? order.order_status;

  return (
    <div className="shrink-0 border-b border-[#EFEFEF] px-3 py-3">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#8E8E8E]">
        배달·주문 처리
      </p>
      <p className="mb-2 text-[12px] text-[#8E8E8E]">
        진행 단계 변경·주문취소는 채팅과 함께 이곳에서 할 수 있습니다. ({statusLabel})
      </p>
      {noticeEl}
      {err ? (
        <p className="mt-2 text-[12px] leading-snug text-red-600 [overflow-wrap:anywhere]">{err}</p>
      ) : null}
      {showTransitionButtons ? (
        <div className="mt-3 flex flex-row flex-nowrap gap-2">
          {next.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy !== null}
              onClick={() => void patch(s)}
              className={s === "cancelled" ? BTN_DANGER : BTN_PRIMARY}
            >
              {busy === s
                ? "처리 중…"
                : labelForOwnerTransition(order.order_status, s, order.fulfillment_type)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * 주문 관리 모달 상단: 채팅 본문 위 고정 — 진행·취소는 여기서 (햄버거는 요약·전송·관리)
 */
export function OwnerStoreOrderDeliveryActionsChatToolbar({
  storeId,
  order,
  orderNo,
  onUpdated,
}: {
  storeId: string;
  order: OwnerDeliveryOrderRef;
  orderNo: string;
  onUpdated: () => void;
}) {
  const next = allowedOrderTransitions(order.order_status, order.fulfillment_type);
  const showTransitionButtons =
    order.order_status !== "refund_requested" &&
    order.order_status !== "refunded" &&
    next.length > 0;
  const { busy, err, patch } = usePatchOrder(storeId, order, onUpdated);

  const statusLabel = BUYER_ORDER_STATUS_LABEL[order.order_status] ?? order.order_status;

  const noticeEl: ReactNode = useMemo(() => {
    if (order.order_status === "refund_requested") {
      return (
        <p className="rounded-md border border-amber-100 bg-amber-50/90 px-2 py-1.5 text-[11px] leading-snug text-amber-950">
          환불 요청됨 — 관리자 배달 주문에서 승인 시 반영됩니다.
        </p>
      );
    }
    if (order.order_status === "refunded") {
      return <p className="text-[11px] leading-snug text-gray-500">환불 처리 완료</p>;
    }
    if (!showTransitionButtons) {
      return <p className="text-[11px] leading-snug text-gray-400">이 단계에서는 변경할 수 없습니다.</p>;
    }
    return null;
  }, [order.order_status, showTransitionButtons]);

  return (
    <div className="shrink-0 border-b border-[#E8E8E8] bg-[#FAFAFA] px-3 py-2">
      <div className="mb-1.5 flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <p className="min-w-0 truncate text-[13px] font-semibold text-gray-900">
          <span className="text-[#8E8E8E]">주문</span> {orderNo}
        </p>
        <p className="shrink-0 text-[12px] font-medium text-[#555]">{statusLabel}</p>
      </div>
      <p className="mb-2 text-[10px] leading-snug text-[#8E8E8E]">
        배달·접수 처리는 여기서 진행하고, 주문 전문·채팅 전송은 우측 ⋯에서 확인하세요.
      </p>
      {noticeEl}
      {err ? (
        <p className="mt-1.5 text-[11px] leading-snug text-red-600 [overflow-wrap:anywhere]">{err}</p>
      ) : null}
      {showTransitionButtons ? (
        <div className="mt-2 flex min-w-0 flex-row flex-wrap gap-2">
          {next.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy !== null}
              onClick={() => void patch(s)}
              className={s === "cancelled" ? `${TB_BTN_DANGER} sm:max-w-[50%]` : `${TB_BTN_PRIMARY} sm:max-w-[50%]`}
            >
              {busy === s
                ? "처리 중…"
                : labelForOwnerTransition(order.order_status, s, order.fulfillment_type)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** 주문 카드 하단 안내 (환불·종료 등) — 기존 UI와 동일 조건 */
export function ownerOrderCardNoticeFooter(order: OwnerDeliveryOrderRef): ReactNode | null {
  const next = allowedOrderTransitions(order.order_status, order.fulfillment_type);
  const showTransitionButtons =
    order.order_status !== "refund_requested" &&
    order.order_status !== "refunded" &&
    next.length > 0;

  if (order.order_status === "refund_requested") {
    return (
      <p className="rounded-lg border border-amber-100 bg-amber-50/80 px-2 py-2 text-[13px] leading-snug text-amber-950">
        구매자가 환불을 요청했습니다. 관리자 화면(배달 주문)에서 승인하면 재고·정산이 반영됩니다.
      </p>
    );
  }
  if (order.order_status === "refunded") {
    return <p className={OC_SM}>환불 처리된 주문입니다.</p>;
  }
  if (!showTransitionButtons) {
    return <p className={`${OC_SM} text-gray-400`}>이 주문은 더 이상 상태를 바꿀 수 없습니다.</p>;
  }
  return null;
}
