"use client";

import { useState } from "react";
import Link from "next/link";
import type { OrderStatus } from "@/lib/admin/delivery-orders-mock/types";
import { ORDER_STATUS_LABEL } from "@/lib/admin/delivery-orders-mock/labels";
import {
  approveCancelRequest,
  approveRefund,
  holdSettlement,
  markSettlementPaid,
  rejectCancelRequest,
  rejectRefund,
  releaseSettlementHold,
  setOrderStatus,
} from "@/lib/admin/delivery-orders-mock/mock-store";
import { useDeliveryMockVersion } from "@/lib/admin/delivery-orders-mock/use-delivery-mock-store";
import { DeliveryReasonModal } from "./DeliveryReasonModal";

const OS_KEYS = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];

export function OrderActionPanel({
  orderId,
  orderType,
  orderStatus,
  storeId,
  buyerUserId,
}: {
  orderId: string;
  orderType: "delivery" | "pickup";
  orderStatus: OrderStatus;
  storeId: string;
  buyerUserId: string;
}) {
  const _v = useDeliveryMockVersion();
  void _v;
  const [toast, setToast] = useState<string | null>(null);
  const [modal, setModal] = useState<
    | { kind: "custom_status"; next: OrderStatus; force: boolean }
    | { kind: "approve_cancel" }
    | { kind: "reject_cancel" }
    | { kind: "approve_refund" }
    | { kind: "reject_refund" }
    | { kind: "hold_settlement" }
    | { kind: "release_settlement" }
    | { kind: "mark_paid" }
    | null
  >(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const quick = (label: string, fn: () => { ok: boolean; error?: string }) => {
    const r = fn();
    showToast(r.ok ? `${label} 반영됨` : r.error ?? "실패");
  };

  return (
    <div className="rounded-ui-rect border border-amber-200 bg-amber-50/40 p-4">
      <p className="text-sm font-bold text-gray-900">운영 액션</p>
      <p className="mt-1 text-xs text-amber-900">
        강제 변경은 사유 필수 · 모든 변경은 감사 로그에 쌓입니다 (mock).
      </p>

      {toast ? (
        <p className="mt-2 rounded bg-white px-2 py-1 text-xs text-gray-800 ring-1 ring-gray-200">{toast}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-ui-rect bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-gray-200"
          onClick={() => quick("접수", () => setOrderStatus(orderId, "accepted", { actorId: "admin", actorType: "admin" }))}
        >
          주문 승인
        </button>
        <button
          type="button"
          className="rounded-ui-rect bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-gray-200"
          onClick={() => quick("조리중", () => setOrderStatus(orderId, "preparing", { actorId: "admin", actorType: "admin" }))}
        >
          조리중
        </button>
        {orderType === "delivery" ? (
          <>
            <button
              type="button"
              className="rounded-ui-rect bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-gray-200"
              onClick={() =>
                quick("픽업준비", () =>
                  setOrderStatus(orderId, "ready_for_pickup", { actorId: "admin", actorType: "admin" })
                )
              }
            >
              픽업준비
            </button>
            <button
              type="button"
              className="rounded-ui-rect bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-gray-200"
              onClick={() =>
                quick("배송중", () => setOrderStatus(orderId, "delivering", { actorId: "admin", actorType: "admin" }))
              }
            >
              배송중
            </button>
            <button
              type="button"
              className="rounded-ui-rect bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-gray-200"
              onClick={() =>
                quick("배송지도착", () => setOrderStatus(orderId, "arrived", { actorId: "admin", actorType: "admin" }))
              }
            >
              배송지도착
            </button>
          </>
        ) : (
          <button
            type="button"
            className="rounded-ui-rect bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-gray-200"
            onClick={() =>
              quick("픽업대기", () =>
                setOrderStatus(orderId, "ready_for_pickup", { actorId: "admin", actorType: "admin" })
              )
            }
          >
            픽업준비
          </button>
        )}
        <button
          type="button"
          className="rounded-ui-rect bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-gray-200"
          onClick={() =>
            quick("주문완료", () => setOrderStatus(orderId, "completed", { actorId: "admin", actorType: "admin" }))
          }
        >
          주문완료
        </button>
        <button
          type="button"
          className="rounded-ui-rect bg-white px-3 py-1.5 text-xs font-medium text-red-700 ring-1 ring-red-200"
          onClick={() => setModal({ kind: "custom_status", next: "cancelled", force: true })}
        >
          주문 취소(강제)
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-amber-200/60 pt-3">
        <button
          type="button"
          className="rounded-ui-rect bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-gray-200"
          onClick={() => setModal({ kind: "approve_cancel" })}
        >
          취소 요청 승인
        </button>
        <button
          type="button"
          className="rounded-ui-rect bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-gray-200"
          onClick={() => setModal({ kind: "reject_cancel" })}
        >
          취소 요청 거절
        </button>
        <button
          type="button"
          className="rounded-ui-rect bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-gray-300 text-gray-800"
          onClick={() => setModal({ kind: "approve_refund" })}
        >
          환불 승인
        </button>
        <button
          type="button"
          className="rounded-ui-rect bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-gray-200"
          onClick={() => setModal({ kind: "reject_refund" })}
        >
          환불 거절
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-amber-200/60 pt-3">
        <button
          type="button"
          className="rounded-ui-rect bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-orange-200"
          onClick={() => setModal({ kind: "hold_settlement" })}
        >
          정산 보류
        </button>
        <button
          type="button"
          className="rounded-ui-rect bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-gray-200"
          onClick={() => setModal({ kind: "release_settlement" })}
        >
          정산 해제
        </button>
        <button
          type="button"
          className="rounded-ui-rect bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-emerald-200 text-emerald-800"
          onClick={() => setModal({ kind: "mark_paid" })}
        >
          정산 완료
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-amber-200/60 pt-3 text-xs">
        <Link href="/admin/stores" className="text-signature underline">
          매장 심사/제재
        </Link>
        <span className="text-gray-300">|</span>
        <Link
          href={`/admin/delivery-orders/by-store/${encodeURIComponent(storeId)}`}
          className="text-signature underline"
        >
          이 매장 주문 이력
        </Link>
        <span className="text-gray-300">|</span>
        <Link
          href={`/admin/delivery-orders/by-buyer/${encodeURIComponent(buyerUserId)}`}
          className="text-signature underline"
        >
          이 회원 주문 이력
        </Link>
        <span className="text-gray-300">|</span>
        <Link href="/admin/delivery-orders" className="text-signature underline">
          전체 주문
        </Link>
      </div>

      <div className="mt-4 rounded border border-gray-200 bg-white p-2">
        <p className="text-xs font-semibold text-gray-700">상태 직접 변경</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            id="admin-order-next-status"
            className="rounded border border-gray-200 px-2 py-1 text-xs"
            defaultValue="preparing"
          >
            {OS_KEYS.map((k) => (
              <option key={k} value={k}>
                {ORDER_STATUS_LABEL[k]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" id="admin-force-status" />
            강제
          </label>
          <button
            type="button"
            className="rounded bg-gray-900 px-2 py-1 text-xs text-white"
            onClick={() => {
              const sel = document.getElementById("admin-order-next-status") as HTMLSelectElement;
              const force = (document.getElementById("admin-force-status") as HTMLInputElement).checked;
              const next = sel.value as OrderStatus;
              setModal({ kind: "custom_status", next, force });
            }}
          >
            사유 입력 후 적용
          </button>
        </div>
      </div>

      <DeliveryReasonModal
        open={modal?.kind === "custom_status"}
        title={
          modal?.kind === "custom_status" ? `상태 → ${ORDER_STATUS_LABEL[modal.next]}` : ""
        }
        label={
          modal?.kind === "custom_status" && modal.force
            ? "강제 변경 사유 (필수)"
            : "변경 메모 (선택)"
        }
        confirmLabel="적용"
        required={modal?.kind === "custom_status" && modal.force}
        onClose={() => setModal(null)}
        onConfirm={(reason) => {
          if (modal?.kind !== "custom_status") return;
          const r = setOrderStatus(orderId, modal.next, {
            actorId: "admin",
            actorType: "admin",
            reason,
            force: modal.force,
          });
          showToast(r.ok ? "상태 변경됨" : r.error ?? "실패");
        }}
      />

      <DeliveryReasonModal
        open={modal?.kind === "approve_cancel"}
        title="취소 요청 승인"
        label="처리 메모"
        confirmLabel="승인"
        onClose={() => setModal(null)}
        onConfirm={(memo) => {
          const r = approveCancelRequest(orderId, memo);
          showToast(r.ok ? "취소 승인" : r.error ?? "실패");
        }}
      />

      <DeliveryReasonModal
        open={modal?.kind === "reject_cancel"}
        title="취소 요청 거절"
        label="거절 사유 (필수)"
        confirmLabel="거절"
        required
        onClose={() => setModal(null)}
        onConfirm={(memo) => {
          const r = rejectCancelRequest(orderId, memo);
          showToast(r.ok ? "거절 처리" : r.error ?? "실패");
        }}
      />

      <DeliveryReasonModal
        open={modal?.kind === "approve_refund"}
        title="환불 승인"
        label="승인 메모 (필수)"
        confirmLabel="환불 승인"
        required
        onClose={() => setModal(null)}
        onConfirm={(memo) => {
          const r = approveRefund(orderId, memo);
          showToast(r.ok ? "환불 승인" : r.error ?? "실패");
        }}
      />

      <DeliveryReasonModal
        open={modal?.kind === "reject_refund"}
        title="환불 거절"
        label="거절 사유 (필수)"
        confirmLabel="거절"
        required
        onClose={() => setModal(null)}
        onConfirm={(memo) => {
          const r = rejectRefund(orderId, memo);
          showToast(r.ok ? "환불 거절" : r.error ?? "실패");
        }}
      />

      <DeliveryReasonModal
        open={modal?.kind === "hold_settlement"}
        title="정산 보류"
        label="보류 사유 (필수)"
        confirmLabel="보류"
        required
        onClose={() => setModal(null)}
        onConfirm={(reason) => {
          const r = holdSettlement(orderId, reason);
          showToast(r.ok ? "보류 처리" : r.error ?? "실패");
        }}
      />

      <DeliveryReasonModal
        open={modal?.kind === "release_settlement"}
        title="정산 보류 해제"
        label="메모"
        confirmLabel="해제"
        onClose={() => setModal(null)}
        onConfirm={(memo) => {
          const r = releaseSettlementHold(orderId, memo);
          showToast(r.ok ? "해제됨" : r.error ?? "실패");
        }}
      />

      <DeliveryReasonModal
        open={modal?.kind === "mark_paid"}
        title="정산 완료"
        label="메모"
        confirmLabel="정산 완료"
        onClose={() => setModal(null)}
        onConfirm={(memo) => {
          const r = markSettlementPaid(orderId, memo);
          showToast(r.ok ? "정산 완료 처리" : r.error ?? "실패");
        }}
      />
    </div>
  );
}
