"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { allowedOrderTransitions } from "@/lib/stores/order-status-transitions";
import {
  BUYER_ORDER_STATUS_LABEL,
  labelForOwnerTransition,
} from "@/lib/stores/store-order-process-criteria";
import { dispatchOwnerHubBadgeRefresh } from "@/lib/chats/chat-channel-events";

const BTN_PRIMARY =
  "flex min-h-[3rem] min-w-0 flex-1 items-center justify-center rounded-ui-rect bg-signature px-2 py-2 text-center sam-text-body-secondary font-medium leading-snug text-white [overflow-wrap:anywhere] [word-break:break-word] disabled:opacity-50 sm:min-h-[2.75rem] sm:min-w-[6rem] sm:px-2.5 sm:py-2 sm:sam-text-body";
const BTN_DANGER =
  "flex min-h-[3rem] min-w-0 flex-1 items-center justify-center rounded-ui-rect border border-red-200 bg-sam-surface px-2 py-2 text-center sam-text-body-secondary font-medium leading-snug text-red-700 [overflow-wrap:anywhere] [word-break:break-word] disabled:opacity-50 sm:min-h-[2.75rem] sm:min-w-[6rem] sm:px-2.5 sm:py-2 sm:sam-text-body";
const OC_SM =
  "sam-text-body-secondary font-normal leading-snug text-sam-muted [overflow-wrap:anywhere] [word-break:break-word]";

const TB_BTN_PRIMARY =
  "flex min-h-9 min-w-0 flex-1 items-center justify-center rounded-ui-rect bg-signature px-2 py-1.5 text-center sam-text-helper font-semibold leading-snug text-white [overflow-wrap:anywhere] [word-break:break-word] disabled:opacity-50";
const TB_BTN_DANGER =
  "flex min-h-9 min-w-0 flex-1 items-center justify-center rounded-ui-rect border border-red-200 bg-sam-surface px-2 py-1.5 text-center sam-text-helper font-semibold leading-snug text-red-700 [overflow-wrap:anywhere] [word-break:break-word] disabled:opacity-50";

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

const PRESET_PREP_MINUTES = [10, 15, 20, 30, 40, 50, 60] as const;

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

function OwnerAcceptPrepModal({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (minutes: number) => void;
}) {
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [presetPick, setPresetPick] = useState<number | null>(null);
  const [customRaw, setCustomRaw] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode("preset");
    setPresetPick(null);
    setCustomRaw("");
  }, [open]);

  if (!open) return null;

  const customNum = Math.floor(Number(customRaw.trim()));
  let resolved = NaN;
  if (mode === "preset") {
    resolved = presetPick ?? NaN;
  } else if (Number.isFinite(customNum)) {
    resolved = customNum;
  }
  const valid = Number.isFinite(resolved) && resolved >= 1 && resolved <= 180;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-accept-prep-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="닫기"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div className="relative z-[1] w-full max-w-md rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-xl">
        <h2 id="owner-accept-prep-title" className="sam-text-body font-semibold text-sam-fg">
          예상 준비 시간
        </h2>
        <p className="mt-1 sam-text-helper leading-snug text-sam-muted">
          접수 확인 후 고객 화면에 표시됩니다. 서버 시각 기준으로 안내 시간이 계산됩니다.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {PRESET_PREP_MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              disabled={busy}
              onClick={() => {
                setMode("preset");
                setPresetPick(m);
              }}
              className={`rounded-full border px-3 py-1.5 sam-text-helper font-medium ${
                mode === "preset" && presetPick === m
                  ? "border-signature bg-signature/10 text-signature"
                  : "border-sam-border-soft bg-sam-app text-sam-fg"
              }`}
            >
              {m}분
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMode("custom");
              setPresetPick(null);
            }}
            className={`rounded-full border px-3 py-1.5 sam-text-helper font-medium ${
              mode === "custom"
                ? "border-signature bg-signature/10 text-signature"
                : "border-sam-border-soft bg-sam-app text-sam-fg"
            }`}
          >
            직접입력
          </button>
        </div>

        {mode === "custom" ? (
          <label className="mt-3 block">
            <span className="sam-text-xxs font-medium text-sam-muted">분 (1–180)</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={180}
              disabled={busy}
              value={customRaw}
              onChange={(e) => setCustomRaw(e.target.value)}
              className="mt-1 w-full rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2 sam-text-body text-sam-fg"
            />
          </label>
        ) : null}

        <div className="mt-4 flex flex-row justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-4 py-2 sam-text-helper font-medium text-sam-fg"
          >
            취소
          </button>
          <button
            type="button"
            disabled={busy || !valid}
            onClick={() => {
              if (!valid) return;
              onConfirm(Math.floor(resolved));
            }}
            className="rounded-ui-rect bg-signature px-4 py-2 sam-text-helper font-semibold text-white disabled:opacity-50"
          >
            {busy ? "처리 중…" : "접수 확인"}
          </button>
        </div>
      </div>
    </div>
  );
}

function usePatchOrder(storeId: string, order: OwnerDeliveryOrderRef, onUpdated: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [prepModalOpen, setPrepModalOpen] = useState(false);

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

  return {
    busy,
    err,
    prepModalOpen,
    closePrepModal: () => setPrepModalOpen(false),
    onTransitionClick,
    confirmPrepAccept,
    prepBusy: busy === "accepted",
  };
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
  const {
    busy,
    err,
    prepModalOpen,
    closePrepModal,
    onTransitionClick,
    confirmPrepAccept,
    prepBusy,
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
        <div className="flex min-w-0 flex-row flex-nowrap gap-2 sm:gap-2">
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
      <OwnerAcceptPrepModal
        open={prepModalOpen}
        busy={prepBusy}
        onClose={closePrepModal}
        onConfirm={confirmPrepAccept}
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
    closePrepModal,
    onTransitionClick,
    confirmPrepAccept,
    prepBusy,
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
      <OwnerAcceptPrepModal
        open={prepModalOpen}
        busy={prepBusy}
        onClose={closePrepModal}
        onConfirm={confirmPrepAccept}
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
    closePrepModal,
    onTransitionClick,
    confirmPrepAccept,
    prepBusy,
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
      <OwnerAcceptPrepModal
        open={prepModalOpen}
        busy={prepBusy}
        onClose={closePrepModal}
        onConfirm={confirmPrepAccept}
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
