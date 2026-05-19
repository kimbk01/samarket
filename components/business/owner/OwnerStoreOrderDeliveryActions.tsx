"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { allowedOrderTransitions } from "@/lib/stores/order-status-transitions";
import {
  BUYER_ORDER_STATUS_LABEL,
  labelForOwnerTransition,
} from "@/lib/stores/store-order-process-criteria";
import { dispatchOwnerHubBadgeRefresh } from "@/lib/chats/chat-channel-events";
import { OwnerOrderAcceptSheet } from "@/components/business/owner/OwnerOrderAcceptSheet";
import { OwnerOrderRejectSheet } from "@/components/business/owner/OwnerOrderRejectSheet";

const BTN_PRIMARY =
  "flex min-h-[44px] min-w-0 flex-1 items-center justify-center rounded-md bg-[#2D7FF9] px-2 py-2 text-center text-[14px] font-semibold leading-snug text-white shadow-sm transition hover:bg-[#1a6fe8] active:bg-[#155ed0] disabled:opacity-50";
const BTN_DANGER =
  "flex min-h-[44px] min-w-0 flex-1 items-center justify-center rounded-md border border-[#FF4D4F] bg-white px-2 py-2 text-center text-[14px] font-semibold leading-snug text-[#FF4D4F] shadow-sm disabled:opacity-50";
const OC_SM =
  "sam-text-body-secondary font-normal leading-snug text-sam-muted [overflow-wrap:anywhere] [word-break:break-word]";

const TB_BTN_PRIMARY =
  "flex min-h-9 min-w-0 flex-1 items-center justify-center rounded-ui-rect bg-[var(--biz-primary)] px-2 py-1.5 text-center sam-text-helper font-semibold leading-snug text-white [overflow-wrap:anywhere] [word-break:break-word] disabled:opacity-50";
const TB_BTN_DANGER =
  "flex min-h-9 min-w-0 flex-1 items-center justify-center rounded-ui-rect border border-red-200 bg-[var(--biz-card-bg)] px-2 py-1.5 text-center sam-text-helper font-semibold leading-snug text-red-700 [overflow-wrap:anywhere] [word-break:break-word] disabled:opacity-50";

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

function formatPatchErr(code: string): string {
  switch (code) {
    case "prep_minutes_required":
      return "예상 준비 시간(1–180분)을 선택해 주세요.";
    case "invalid_transition":
      return "지금 단계에서는 해당 처리를 할 수 없습니다.";
    case "order_admin_locked":
      return "플랫폼에서 이 주문을 잠갔습니다. 운영센터로 문의해 주세요.";
    default:
      return code;
  }
}

function usePatchOrder(storeId: string, order: OwnerDeliveryOrderRef, onUpdated: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [prepModalOpen, setPrepModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);

  const patch = useCallback(
    async (status: string, extras?: { estimated_prep_minutes?: number }): Promise<boolean> => {
      setErr(null);
      setBusy(status);
      try {
        const body: Record<string, unknown> = { order_status: status };
        if (extras?.estimated_prep_minutes != null) {
          body.estimated_prep_minutes = extras.estimated_prep_minutes;
        }
        const res = await fetch(
          `/api/me/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(order.id)}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!j?.ok) {
          const code = typeof j?.error === "string" ? j.error : "update_failed";
          setErr(formatPatchErr(code));
          return false;
        }
        dispatchOwnerHubBadgeRefresh({
          source: "owner-store-order-delivery-actions",
          key: `${storeId}:${order.id}:${status}`,
        });
        onUpdated();
        return true;
      } catch {
        setErr("network_error");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [storeId, order.id, onUpdated]
  );

  const onTransitionClick = useCallback(
    (s: string) => {
      if (order.order_status === "pending" && s === "accepted") {
        setPrepModalOpen(true);
        return;
      }
      if (order.order_status === "pending" && s === "cancelled") {
        setRejectModalOpen(true);
        return;
      }
      void patch(s);
    },
    [order.order_status, patch]
  );

  const confirmPrepAccept = useCallback(
    (minutes: number) => {
      void patch("accepted", { estimated_prep_minutes: minutes }).then((ok) => {
        if (ok) setPrepModalOpen(false);
      });
    },
    [patch]
  );

  const confirmReject = useCallback(
    (_reasonLabel: string) => {
      void patch("cancelled").then((ok) => {
        if (ok) setRejectModalOpen(false);
      });
    },
    [patch]
  );

  return {
    busy,
    err,
    prepModalOpen,
    rejectModalOpen,
    closePrepModal: () => setPrepModalOpen(false),
    closeRejectModal: () => setRejectModalOpen(false),
    onTransitionClick,
    confirmPrepAccept,
    confirmReject,
    prepBusy: busy === "accepted",
    rejectBusy: busy === "cancelled",
  };
}

/** 주문 카드: `aside` = 회색 박스 오른쪽 열, `rowBelow` = 카드 하단 전체 폭 */
export function OwnerStoreOrderDeliveryActionsAside({
  storeId,
  order,
  onUpdated,
  variant = "aside",
  acceptSheetOverlayClassName,
  rowBelowButtonLayout = "column",
}: {
  storeId: string;
  order: OwnerDeliveryOrderRef;
  onUpdated: () => void;
  variant?: "aside" | "rowBelow";
  acceptSheetOverlayClassName?: string;
  rowBelowButtonLayout?: "column" | "row";
}) {
  const next = allowedOrderTransitions(order.order_status, order.fulfillment_type);
  const showTransitionButtons =
    order.order_status !== "refund_requested" &&
    order.order_status !== "refunded" &&
    next.length > 0;
  const {
    busy,
    err,
    prepModalOpen,
    rejectModalOpen,
    closePrepModal,
    closeRejectModal,
    onTransitionClick,
    confirmPrepAccept,
    confirmReject,
    prepBusy,
    rejectBusy,
  } = usePatchOrder(storeId, order, onUpdated);

  if (!showTransitionButtons) return null;

  const wrapClass =
    variant === "rowBelow"
      ? "flex w-full min-w-0 flex-col justify-center gap-2"
      : "flex min-w-0 max-w-[min(100%,13.25rem)] flex-col justify-center justify-self-end gap-2 sm:max-w-none";

  return (
    <>
      <div className={wrapClass}>
        {err ? (
          <p className="max-w-full text-left sam-text-xxs leading-snug text-red-600 [overflow-wrap:anywhere] [word-break:break-word]">
            {err}
          </p>
        ) : null}
        <div
          className={
            variant === "rowBelow"
              ? rowBelowButtonLayout === "row"
                ? "flex w-full min-w-0 flex-row gap-2"
                : "flex w-full min-w-0 flex-col gap-2"
              : "flex min-w-0 flex-row flex-nowrap gap-2 sm:gap-2"
          }
        >
          {next.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy !== null}
              onClick={() => onTransitionClick(s)}
              className={s === "cancelled" ? BTN_DANGER : BTN_PRIMARY}
            >
              {busy === s
                ? "처리 중…"
                : labelForOwnerTransition(order.order_status, s, order.fulfillment_type)}
            </button>
          ))}
        </div>
      </div>
      <OwnerOrderAcceptSheet
        open={prepModalOpen}
        busy={prepBusy}
        onClose={closePrepModal}
        onConfirm={confirmPrepAccept}
        overlayClassName={acceptSheetOverlayClassName}
      />
      <OwnerOrderRejectSheet
        open={rejectModalOpen}
        busy={rejectBusy}
        onClose={closeRejectModal}
        onConfirm={confirmReject}
      />
    </>
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
  const {
    busy,
    err,
    prepModalOpen,
    rejectModalOpen,
    closePrepModal,
    closeRejectModal,
    onTransitionClick,
    confirmPrepAccept,
    confirmReject,
    prepBusy,
    rejectBusy,
  } = usePatchOrder(storeId, order, onUpdated);

  const noticeEl: ReactNode = useMemo(() => {
    if (order.order_status === "refund_requested") {
      return (
        <p className="rounded-ui-rect border border-amber-100 bg-amber-50/80 px-2 py-2 sam-text-helper leading-snug text-amber-950">
          구매자가 환불을 요청했습니다. 관리자 화면(배달 주문)에서 승인하면 재고·정산이 반영됩니다.
        </p>
      );
    }
    if (order.order_status === "refunded") {
      return <p className={OC_SM}>환불 처리된 주문입니다.</p>;
    }
    if (!showTransitionButtons) {
      return (
        <p className={`${OC_SM} text-sam-meta`}>이 주문은 더 이상 상태를 바꿀 수 없습니다.</p>
      );
    }
    return null;
  }, [order.order_status, showTransitionButtons]);

  const statusLabel = BUYER_ORDER_STATUS_LABEL[order.order_status] ?? order.order_status;

  return (
    <>
      <div className="shrink-0 border-b border-sam-border px-3 py-3">
        <p className="mb-1 sam-text-xxs font-semibold uppercase tracking-wide text-muted">
          배달·주문 처리
        </p>
        <p className="mb-2 sam-text-helper text-muted">
          진행 단계 변경·주문취소는 채팅과 함께 이곳에서 할 수 있습니다. ({statusLabel})
        </p>
        {noticeEl}
        {err ? (
          <p className="mt-2 sam-text-helper leading-snug text-red-600 [overflow-wrap:anywhere]">{err}</p>
        ) : null}
        {showTransitionButtons ? (
          <div className="mt-3 flex flex-row flex-nowrap gap-2">
            {next.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy !== null}
                onClick={() => onTransitionClick(s)}
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
      <OwnerOrderAcceptSheet
        open={prepModalOpen}
        busy={prepBusy}
        onClose={closePrepModal}
        onConfirm={confirmPrepAccept}
      />
      <OwnerOrderRejectSheet
        open={rejectModalOpen}
        busy={rejectBusy}
        onClose={closeRejectModal}
        onConfirm={confirmReject}
      />
    </>
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
  const {
    busy,
    err,
    prepModalOpen,
    rejectModalOpen,
    closePrepModal,
    closeRejectModal,
    onTransitionClick,
    confirmPrepAccept,
    confirmReject,
    prepBusy,
    rejectBusy,
  } = usePatchOrder(storeId, order, onUpdated);

  const statusLabel = BUYER_ORDER_STATUS_LABEL[order.order_status] ?? order.order_status;

  const noticeEl: ReactNode = useMemo(() => {
    if (order.order_status === "refund_requested") {
      return (
        <p className="rounded-ui-rect border border-amber-100 bg-amber-50/90 px-2 py-1.5 sam-text-xxs leading-snug text-amber-950">
          환불 요청됨 — 관리자 배달 주문에서 승인 시 반영됩니다.
        </p>
      );
    }
    if (order.order_status === "refunded") {
      return <p className="sam-text-xxs leading-snug text-sam-muted">환불 처리 완료</p>;
    }
    if (!showTransitionButtons) {
      return <p className="sam-text-xxs leading-snug text-sam-meta">이 단계에서는 변경할 수 없습니다.</p>;
    }
    return null;
  }, [order.order_status, showTransitionButtons]);

  return (
    <>
      <div className="shrink-0 border-b border-sam-border bg-background px-3 py-2">
        <div className="mb-1.5 flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <p className="min-w-0 truncate sam-text-body-secondary font-semibold text-sam-fg">
            <span className="text-muted">주문</span> {orderNo}
          </p>
          <p className="shrink-0 sam-text-helper font-medium text-[#555]">{statusLabel}</p>
        </div>
        <p className="mb-2 sam-text-xxs leading-snug text-muted">
          배달·접수 처리는 여기서 진행하고, 주문 전문·채팅 전송은 우측 ⋯에서 확인하세요.
        </p>
        {noticeEl}
        {err ? (
          <p className="mt-1.5 sam-text-xxs leading-snug text-red-600 [overflow-wrap:anywhere]">{err}</p>
        ) : null}
        {showTransitionButtons ? (
          <div className="mt-2 flex min-w-0 flex-row flex-wrap gap-2">
            {next.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy !== null}
                onClick={() => onTransitionClick(s)}
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
      <OwnerOrderAcceptSheet
        open={prepModalOpen}
        busy={prepBusy}
        onClose={closePrepModal}
        onConfirm={confirmPrepAccept}
      />
      <OwnerOrderRejectSheet
        open={rejectModalOpen}
        busy={rejectBusy}
        onClose={closeRejectModal}
        onConfirm={confirmReject}
      />
    </>
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
      <p className="rounded-ui-rect border border-amber-100 bg-amber-50/80 px-2 py-2 sam-text-body-secondary leading-snug text-amber-950">
        구매자가 환불을 요청했습니다. 관리자 화면(배달 주문)에서 승인하면 재고·정산이 반영됩니다.
      </p>
    );
  }
  if (order.order_status === "refunded") {
    return <p className={OC_SM}>환불 처리된 주문입니다.</p>;
  }
  if (!showTransitionButtons) {
    return <p className={`${OC_SM} text-sam-meta`}>이 주문은 더 이상 상태를 바꿀 수 없습니다.</p>;
  }
  return null;
}

const PEEK_CANCEL_BTN =
  "inline-flex h-10 w-full items-center justify-center rounded-ui-rect border border-red-200/90 px-3 sam-text-body font-semibold text-red-600 transition active:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";

/** 메신저 peek 주문 상세 패널 — 주문 취소만 (진행 CTA는 composer 위 액션 바) */
export function OwnerStoreOrderPeekCancelBar({
  storeId,
  order,
  onUpdated,
}: {
  storeId: string;
  order: OwnerDeliveryOrderRef;
  onUpdated: () => void;
}) {
  const next = allowedOrderTransitions(order.order_status, order.fulfillment_type);
  const canCancel = next.includes("cancelled");
  const {
    busy,
    err,
    rejectModalOpen,
    closeRejectModal,
    onTransitionClick,
    confirmReject,
    rejectBusy,
  } = usePatchOrder(storeId, order, onUpdated);

  if (order.order_status === "cancelled" || order.order_status === "refunded") {
    return null;
  }

  return (
    <>
      <div className="shrink-0 border-b border-sam-border px-3 py-2.5">
        <button
          type="button"
          disabled={!canCancel || busy !== null}
          onClick={() => onTransitionClick("cancelled")}
          className={PEEK_CANCEL_BTN}
        >
          {rejectBusy ? "처리 중…" : "주문취소"}
        </button>
        {!canCancel ? (
          <p className="mt-1.5 sam-text-xxs leading-snug text-sam-muted">
            이 단계에서는 주문을 취소할 수 없습니다.
          </p>
        ) : null}
        {err ? (
          <p className="mt-1.5 sam-text-xxs leading-snug text-red-600 [overflow-wrap:anywhere]">{err}</p>
        ) : null}
      </div>
      <OwnerOrderRejectSheet
        open={rejectModalOpen}
        busy={rejectBusy}
        onClose={closeRejectModal}
        onConfirm={confirmReject}
      />
    </>
  );
}
