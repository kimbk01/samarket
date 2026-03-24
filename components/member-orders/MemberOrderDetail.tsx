"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
          <Link href={listHref} className="text-sm font-semibold text-gray-600">
            ← 목록
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-center text-[15px] font-bold">주문 상세</h1>
          <span className="w-10" />
        </div>
      </header>

      <div className="mx-auto max-w-lg space-y-3 px-3 py-4">
        {toast ? (
          <p className="rounded-xl bg-gray-900 px-3 py-2 text-center text-xs text-white">{toast}</p>
        ) : null}

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-lg font-bold text-gray-900">{order.store_name}</p>
              <Link
                href={`/stores/${encodeURIComponent(order.store_slug)}`}
                className="text-xs font-medium text-violet-700 underline"
              >
                매장 보기
              </Link>
            </div>
            <div className="flex flex-col items-end gap-2">
              <MemberOrderStatusBadge status={order.order_status} />
              <Link
                href={`${listHref}/${encodeURIComponent(order.id)}/chat`}
                className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-800 ring-1 ring-violet-200"
              >
                채팅하기
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
              className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                order.order_type === "delivery" ? "bg-violet-50 text-violet-900" : "bg-teal-50 text-teal-900"
              }`}
            >
              {order.order_type === "delivery" ? "배달 주문" : "포장 주문"}
            </span>
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
              결제 {MEMBER_PAYMENT_LABEL[order.payment_status]}
            </span>
          </div>
          <p className="mt-3 text-sm font-medium text-gray-800">{MEMBER_STATUS_USER_MESSAGE[order.order_status]}</p>
          <div className="mt-4 border-t border-gray-100 pt-4">
            <MemberOrderStepper order={order} />
          </div>
        </section>

        {order.cancel_request_reason ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-bold">취소 요청 사유</p>
            <p className="mt-1">{order.cancel_request_reason}</p>
          </section>
        ) : null}

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-sm font-bold text-gray-900">주문 메뉴</h2>
          <div className="mt-3">
            <MemberOrderItems items={order.items} />
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-sm font-bold text-gray-900">금액</h2>
          <div className="mt-3">
            <MemberOrderSummary order={order} />
          </div>
        </section>

        {order.order_type === "delivery" ? (
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-sm font-bold text-gray-900">배달 정보</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs text-gray-500">주소</dt>
                <dd className="text-gray-900">{order.delivery_address_summary ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">연락처</dt>
                <dd className="font-mono text-gray-900">{order.buyer_phone}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">요청사항</dt>
                <dd className="text-gray-900">{order.request_message?.trim() || "—"}</dd>
              </div>
            </dl>
          </section>
        ) : (
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-sm font-bold text-gray-900">포장·픽업</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs text-gray-500">픽업 안내</dt>
                <dd className="text-gray-900">{order.pickup_note ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">요청사항</dt>
                <dd className="text-gray-900">{order.request_message?.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">픽업 가능</dt>
                <dd className="font-medium text-gray-900">
                  {order.order_status === "ready_for_pickup"
                    ? "지금 픽업하실 수 있어요"
                    : order.order_status === "completed"
                      ? "픽업이 완료된 주문이에요"
                      : "매장에서 준비 중이에요"}
                </dd>
              </div>
            </dl>
          </section>
        )}

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-sm font-bold text-gray-900">상태 이력</h2>
          <div className="mt-4">
            <MemberOrderTimeline logs={order.logs} />
          </div>
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-100 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          {canCancelRequest ? (
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className="w-full rounded-xl border border-red-200 bg-white py-3 text-sm font-bold text-red-700"
            >
              취소 요청
            </button>
          ) : null}
          {preparingPlus && !issueState ? (
            <button
              type="button"
              onClick={() => {
                const reason = window.prompt("환불·문제 사유를 입력해 주세요.");
                if (reason == null || !reason.trim()) return;
                const r = requestMemberOrderRefund(buyerUserId, order.id, reason.trim());
                setToast(r.ok ? "환불 요청이 접수되었어요." : r.error);
                setTimeout(() => setToast(null), 2800);
              }}
              className="w-full rounded-xl border border-amber-200 bg-amber-50 py-3 text-sm font-bold text-amber-900"
            >
              환불·문제 요청
            </button>
          ) : null}
          {completed ? (
            <>
              <button
                type="button"
                onClick={() => alert("샘플: 재주문은 매장 페이지에서 메뉴를 담아 주세요.")}
                className="w-full rounded-xl bg-gray-900 py-3 text-sm font-bold text-white"
              >
                재주문 (샘플)
              </button>
              <button
                type="button"
                onClick={() => alert("샘플: 리뷰 작성은 추정 매장 리뷰 플로우와 연결 예정입니다.")}
                className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-800"
              >
                리뷰 작성 (샘플)
              </button>
            </>
          ) : null}
          {issueState && !completed ? (
            <p className="py-2 text-center text-xs text-gray-500">
              취소·환불 관련 문의는 고객센터로 연락해 주세요. (샘플)
            </p>
          ) : null}
          {!completed && !canCancelRequest && !preparingPlus && !issueState ? (
            <Link
              href={`${listHref}/${encodeURIComponent(order.id)}/chat`}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 py-3 text-sm font-bold text-violet-900"
            >
              채팅으로 문의하기
              <UnreadBadge count={chatUnread} />
            </Link>
          ) : null}
        </div>
      </div>

      <CancelOrderRequestModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={(label, detail) => {
          const r = requestMemberOrderCancel(buyerUserId, order.id, label, detail);
          setToast(r.ok ? "취소 요청이 접수되었어요." : r.error);
          setTimeout(() => setToast(null), 2800);
        }}
      />
    </div>
  );
}
