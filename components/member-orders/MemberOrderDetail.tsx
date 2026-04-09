"use client";

import Link from "next/link";
import { HistoryBackTextLink } from "@/components/navigation/HistoryBackTextLink";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { UnreadBadge } from "@/components/order-chat/UnreadBadge";
import { useOrderChatVersion } from "@/components/order-chat/use-order-chat-version";
import { getOrderChatUnreadForMember } from "@/lib/shared-order-chat/shared-chat-store";
import type { MemberOrder } from "@/lib/member-orders/types";
import {
  MEMBER_PAYMENT_LABEL,
  MEMBER_STATUS_USER_MESSAGE,
} from "@/lib/member-orders/member-order-labels";
import { requestMemberOrderCancel, requestMemberOrderRefund } from "@/lib/member-orders/member-order-store";
import { CancelOrderRequestModal } from "./CancelOrderRequestModal";
import { MemberOrderItems } from "./MemberOrderItems";
import { MemberOrderStatusBadge } from "./MemberOrderStatusBadge";
import { MemberOrderStepper } from "./MemberOrderStepper";
import { MemberOrderSummary } from "./MemberOrderSummary";
import { MemberOrderTimeline } from "./MemberOrderTimeline";

export function MemberOrderDetail({
  buyerUserId,
  order,
  listHref,
}: {
  buyerUserId: string;
  order: MemberOrder;
  listHref: string;
}) {
  const { t, tt } = useI18n();
  const cv = useOrderChatVersion();
  const [toast, setToast] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const chatUnread = useMemo(() => {
    void cv;
    return getOrderChatUnreadForMember(order.id, buyerUserId);
  }, [cv, order.id, buyerUserId]);

  const canCancelRequest = order.order_status === "pending" || order.order_status === "accepted";
  const preparingPlus = ["preparing", "delivering", "ready_for_pickup", "arrived"].includes(
    order.order_status
  );
  const completed = order.order_status === "completed";
  const issueState = ["cancel_requested", "refund_requested", "cancelled", "refunded"].includes(
    order.order_status
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-36">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white px-3 py-3">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <HistoryBackTextLink
            fallbackHref={listHref}
            className="text-sm font-semibold text-gray-600"
            aria-label={t("member_order_back_to_list")}
          >
            ← {t("member_order_back_to_list")}
          </HistoryBackTextLink>
          <h1 className="min-w-0 flex-1 truncate text-center text-[15px] font-bold">{t("member_order_detail_title")}</h1>
          <span className="w-10" />
        </div>
      </header>

      <div className="mx-auto max-w-lg space-y-3 px-3 py-4">
        {toast ? (
          <p className="rounded-ui-rect bg-gray-900 px-3 py-2 text-center text-xs text-white">{toast}</p>
        ) : null}

        <section className="rounded-ui-rect bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-lg font-bold text-gray-900">{order.store_name}</p>
              <Link
                href={`/stores/${encodeURIComponent(order.store_slug)}`}
                className="text-xs font-medium text-signature underline"
              >
                {t("member_order_store_view")}
              </Link>
            </div>
            <div className="flex flex-col items-end gap-2">
              <MemberOrderStatusBadge status={order.order_status} />
              <Link
                href={`${listHref}/${encodeURIComponent(order.id)}/chat`}
                className="inline-flex items-center gap-1 rounded-full bg-signature/5 px-3 py-1.5 text-xs font-bold text-gray-800 ring-1 ring-gray-300"
              >
                {t("member_order_chat_action")}
                <UnreadBadge count={chatUnread} />
              </Link>
            </div>
          </div>
          <p className="mt-2 font-mono text-xs text-gray-400">{order.order_no}</p>
          <p className="mt-1 text-xs text-gray-500">
            {new Date(order.created_at).toLocaleString("ko-KR")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className={`rounded-ui-rect px-2 py-0.5 text-xs font-bold ${
                order.order_type === "delivery" ? "bg-signature/5 text-gray-900" : "bg-teal-50 text-teal-900"
              }`}
            >
              {order.order_type === "delivery" ? t("member_order_delivery_type") : t("member_order_pickup_type")}
            </span>
            <span className="rounded-ui-rect bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
              {t("member_order_payment")} {tt(MEMBER_PAYMENT_LABEL[order.payment_status])}
            </span>
          </div>
          <p className="mt-3 text-sm font-medium text-gray-800">{tt(MEMBER_STATUS_USER_MESSAGE[order.order_status])}</p>
          <div className="mt-4 border-t border-gray-100 pt-4">
            <MemberOrderStepper order={order} />
          </div>
        </section>

        {order.cancel_request_reason ? (
          <section className="rounded-ui-rect border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-bold">{t("member_order_cancel_reason_title")}</p>
            <p className="mt-1">{order.cancel_request_reason}</p>
          </section>
        ) : null}

        <section className="rounded-ui-rect bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-sm font-bold text-gray-900">{t("member_order_menu_title")}</h2>
          <div className="mt-3">
            <MemberOrderItems items={order.items} />
          </div>
        </section>

        <section className="rounded-ui-rect bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-sm font-bold text-gray-900">{t("member_order_amount_title")}</h2>
          <div className="mt-3">
            <MemberOrderSummary order={order} />
          </div>
        </section>

        {order.order_type === "delivery" ? (
          <section className="rounded-ui-rect bg-white p-4 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-sm font-bold text-gray-900">{t("member_order_delivery_info_title")}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs text-gray-500">{t("member_order_address")}</dt>
                <dd className="text-gray-900">{order.delivery_address_summary ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">{t("member_order_contact")}</dt>
                <dd className="font-mono text-gray-900">{order.buyer_phone}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">{t("member_order_request_note")}</dt>
                <dd className="text-gray-900">{order.request_message?.trim() || "—"}</dd>
              </div>
            </dl>
          </section>
        ) : (
          <section className="rounded-ui-rect bg-white p-4 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-sm font-bold text-gray-900">{t("member_order_pickup_title")}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs text-gray-500">{t("member_order_pickup_guide")}</dt>
                <dd className="text-gray-900">{order.pickup_note ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">{t("member_order_request_note")}</dt>
                <dd className="text-gray-900">{order.request_message?.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">{t("member_order_pickup_available")}</dt>
                <dd className="font-medium text-gray-900">
                  {order.order_status === "ready_for_pickup"
                    ? t("member_order_pickup_now")
                    : order.order_status === "completed"
                      ? t("member_order_pickup_done")
                      : t("member_order_pickup_preparing")}
                </dd>
              </div>
            </dl>
          </section>
        )}

        <section className="rounded-ui-rect bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-sm font-bold text-gray-900">{t("member_order_status_history")}</h2>
          <div className="mt-4">
            <MemberOrderTimeline logs={order.logs} />
          </div>
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-100 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          {!issueState ? (
            <Link
              href={`${listHref}/${encodeURIComponent(order.id)}/chat`}
              className="flex w-full items-center justify-center gap-2 rounded-ui-rect border border-gray-200 bg-signature/5 py-3 text-sm font-bold text-gray-900"
            >
              {t("member_order_continue_chat")}
              <UnreadBadge count={chatUnread} />
            </Link>
          ) : null}
          {canCancelRequest ? (
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className="w-full rounded-ui-rect border border-red-200 bg-white py-3 text-sm font-bold text-red-700"
            >
              {t("member_order_cancel_action")}
            </button>
          ) : null}
          {preparingPlus && !issueState ? (
            <button
              type="button"
              onClick={() => {
                const reason = window.prompt(t("member_order_refund_prompt"));
                if (reason == null || !reason.trim()) return;
                const r = requestMemberOrderRefund(buyerUserId, order.id, reason.trim());
                setToast(r.ok ? t("member_order_refund_requested") : r.error);
                setTimeout(() => setToast(null), 2800);
              }}
              className="w-full rounded-ui-rect border border-amber-200 bg-amber-50 py-3 text-sm font-bold text-amber-900"
            >
              {t("member_order_refund_action")}
            </button>
          ) : null}
          {completed ? (
            <>
              <button
                type="button"
                onClick={() => alert("샘플: 재주문은 매장 페이지에서 메뉴를 담아 주세요.")}
                className="w-full rounded-ui-rect bg-gray-900 py-3 text-sm font-bold text-white"
              >
                {t("member_order_reorder_sample")}
              </button>
              <button
                type="button"
                onClick={() => alert("샘플: 리뷰 작성은 추정 매장 리뷰 플로우와 연결 예정입니다.")}
                className="w-full rounded-ui-rect border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-800"
              >
                {t("member_order_review_sample")}
              </button>
            </>
          ) : null}
          {issueState && !completed ? (
            <p className="py-2 text-center text-xs text-gray-500">
              {t("member_order_issue_contact_sample")}
            </p>
          ) : null}
        </div>
      </div>

      <CancelOrderRequestModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={(label, detail) => {
          const r = requestMemberOrderCancel(buyerUserId, order.id, label, detail);
          setToast(r.ok ? t("member_orders_cancel_requested") : r.error);
          setTimeout(() => setToast(null), 2800);
        }}
      />
    </div>
  );
}
