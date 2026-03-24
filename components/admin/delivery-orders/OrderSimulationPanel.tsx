"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  findSharedOrder,
  getSharedOrdersVersion,
  listSharedOrdersRaw,
  resetSharedOrders,
  sharedAdminApproveCancel,
  sharedAdminApproveRefund,
  sharedAdminHoldSettlement,
  sharedAdminRejectCancel,
  sharedAdminRejectRefund,
  sharedAdminReleaseSettlement,
  sharedAdminSetOrderStatus,
  sharedMemberRequestCancel,
  sharedMemberRequestRefund,
  sharedOwnerAccept,
  sharedOwnerAcknowledgeCancel,
  sharedOwnerComplete,
  sharedOwnerMarkArrived,
  sharedOwnerMarkPickupReady,
  sharedOwnerReject,
  sharedOwnerStartDelivery,
  sharedOwnerStartPreparing,
  sharedSimulateMemberPlaceOrder,
  subscribeSharedOrders,
} from "@/lib/shared-orders/shared-order-store";
import type { SharedOrderStatus } from "@/lib/shared-orders/types";

const FORCE_STATUS_OPTIONS: SharedOrderStatus[] = [
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
  "completed",
  "cancel_requested",
  "cancelled",
  "refund_requested",
  "refunded",
];

function pick<T>(x: { ok: true } | { ok: false; error: string }): string {
  return x.ok ? "OK" : x.error;
}

export function OrderSimulationPanel() {
  const v = useSyncExternalStore(subscribeSharedOrders, getSharedOrdersVersion, getSharedOrdersVersion);
  const rows = useMemo(() => {
    void v;
    return listSharedOrdersRaw();
  }, [v]);

  const [selectedId, setSelectedId] = useState("");
  const [lastMsg, setLastMsg] = useState<string | null>(null);
  const [adminReason, setAdminReason] = useState("관리자 시뮬 사유");
  const [adminMemo, setAdminMemo] = useState("관리자 메모");
  const [forceNext, setForceNext] = useState<SharedOrderStatus>("cancelled");

  const selected = selectedId ? findSharedOrder(selectedId) : undefined;

  const setResult = (label: string, r: { ok: true } | { ok: false; error: string }) => {
    setLastMsg(`${label}: ${pick(r)}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">주문 시뮬레이션 패널</h1>
          <p className="mt-1 text-xs text-gray-600">
            회원·오너·관리자가 같은 공유 주문 스토어를 수정합니다.{" "}
            <Link href="/admin/delivery-orders" className="text-signature underline">
              운영 대시보드
            </Link>
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-800"
          onClick={() => {
            if (confirm("공유 주문 데이터를 초기화할까요?")) {
              resetSharedOrders();
              setSelectedId("");
              setLastMsg("초기화됨");
            }
          }}
        >
          데이터 초기화
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700">
          주문 선택
          <select
            className="min-w-[240px] rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">— 선택 —</option>
            {rows.map((o) => (
              <option key={o.id} value={o.id}>
                {o.order_no} · {o.buyer_name} · {o.order_status}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-bold text-white"
          onClick={() => {
            const r = sharedSimulateMemberPlaceOrder({ order_type: "delivery" });
            setResult("새 배달 주문", r);
            if (r.ok) setSelectedId(r.orderId);
          }}
        >
          + 배달 주문 생성
        </button>
        <button
          type="button"
          className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white"
          onClick={() => {
            const r = sharedSimulateMemberPlaceOrder({ order_type: "pickup" });
            setResult("새 포장 주문", r);
            if (r.ok) setSelectedId(r.orderId);
          }}
        >
          + 포장 주문 생성
        </button>
      </div>

      {lastMsg ? (
        <p className="rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs text-white">{lastMsg}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">회원 액션</h2>
          <p className="mt-1 text-[11px] text-gray-500">선택 주문의 buyer 기준</p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              disabled={!selected}
              className="rounded-lg border border-red-200 py-2 text-xs font-semibold text-red-800 disabled:opacity-40"
              onClick={() => {
                if (!selected) return;
                const r = sharedMemberRequestCancel(selected.id, selected.buyer_user_id, "시뮬: 취소 요청");
                setResult("취소 요청", r);
              }}
            >
              취소 요청
            </button>
            <button
              type="button"
              disabled={!selected}
              className="rounded-lg border border-amber-200 py-2 text-xs font-semibold text-amber-900 disabled:opacity-40"
              onClick={() => {
                if (!selected) return;
                const r = sharedMemberRequestRefund(selected.id, selected.buyer_user_id, "시뮬: 환불 요청");
                setResult("환불 요청", r);
              }}
            >
              환불 요청
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">오너 액션</h2>
          <p className="mt-1 text-[11px] text-gray-500">서울한식당 시뮬 매장만</p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              disabled={!selected}
              className="rounded-lg bg-violet-600 py-2 text-xs font-bold text-white disabled:opacity-40"
              onClick={() => selected && setResult("수락", sharedOwnerAccept(selected.id))}
            >
              수락
            </button>
            <button
              type="button"
              disabled={!selected}
              className="rounded-lg border border-gray-300 py-2 text-xs font-semibold text-gray-800 disabled:opacity-40"
              onClick={() =>
                selected && setResult("거절", sharedOwnerReject(selected.id, "시뮬: 매장 거절"))
              }
            >
              거절
            </button>
            <button
              type="button"
              disabled={!selected}
              className="rounded-lg border border-gray-300 py-2 text-xs font-semibold text-gray-800 disabled:opacity-40"
              onClick={() =>
                selected && setResult("조리중", sharedOwnerStartPreparing(selected.id))
              }
            >
              조리중
            </button>
            <button
              type="button"
              disabled={!selected}
              className="rounded-lg border border-gray-300 py-2 text-xs font-semibold text-gray-800 disabled:opacity-40"
              onClick={() =>
                selected && setResult("픽업준비", sharedOwnerMarkPickupReady(selected.id))
              }
            >
              픽업 준비
            </button>
            <button
              type="button"
              disabled={!selected}
              className="rounded-lg border border-gray-300 py-2 text-xs font-semibold text-gray-800 disabled:opacity-40"
              onClick={() =>
                selected && setResult("배송중", sharedOwnerStartDelivery(selected.id))
              }
            >
              배송중
            </button>
            <button
              type="button"
              disabled={!selected}
              className="rounded-lg border border-gray-300 py-2 text-xs font-semibold text-gray-800 disabled:opacity-40"
              onClick={() =>
                selected && setResult("배송지도착", sharedOwnerMarkArrived(selected.id))
              }
            >
              배송지 도착
            </button>
            <button
              type="button"
              disabled={!selected}
              className="rounded-lg bg-gray-900 py-2 text-xs font-bold text-white disabled:opacity-40"
              onClick={() => selected && setResult("주문완료", sharedOwnerComplete(selected.id))}
            >
              주문완료
            </button>
            <button
              type="button"
              disabled={!selected}
              className="rounded-lg border border-amber-200 py-2 text-xs font-semibold text-amber-900 disabled:opacity-40"
              onClick={() =>
                selected &&
                setResult("취소요청 확인", sharedOwnerAcknowledgeCancel(selected.id))
              }
            >
              취소 요청 확인(로그)
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">관리자 액션</h2>
          <div className="mt-3 space-y-2">
            <label className="block text-[11px] font-medium text-gray-600">
              강제 다음 상태
              <select
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                value={forceNext}
                onChange={(e) => setForceNext(e.target.value as SharedOrderStatus)}
              >
                {FORCE_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <input
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
              value={adminReason}
              onChange={(e) => setAdminReason(e.target.value)}
              placeholder="강제 변경 사유"
            />
            <button
              type="button"
              disabled={!selected}
              className="w-full rounded-lg bg-red-700 py-2 text-xs font-bold text-white disabled:opacity-40"
              onClick={() => {
                if (!selected) return;
                const r = sharedAdminSetOrderStatus(selected.id, forceNext, {
                  force: true,
                  reason: adminReason,
                  paymentStatus:
                    forceNext === "cancelled" || forceNext === "refunded" ? "refunded" : undefined,
                  settlementStatus:
                    forceNext === "cancelled" || forceNext === "refunded"
                      ? "cancelled"
                      : undefined,
                  adminAction: forceNext === "cancelled" ? "admin_cancelled" : undefined,
                });
                setResult(`강제 → ${forceNext}`, r);
              }}
            >
              강제 상태 변경
            </button>
            <div className="border-t border-gray-100 pt-2" />
            <button
              type="button"
              disabled={!selected}
              className="w-full rounded-lg border border-gray-300 py-2 text-xs font-semibold disabled:opacity-40"
              onClick={() => selected && setResult("취소 승인", sharedAdminApproveCancel(selected.id, adminMemo))}
            >
              취소 승인
            </button>
            <button
              type="button"
              disabled={!selected}
              className="w-full rounded-lg border border-gray-300 py-2 text-xs font-semibold disabled:opacity-40"
              onClick={() =>
                selected && setResult("취소 거절", sharedAdminRejectCancel(selected.id, adminMemo))
              }
            >
              취소 거절
            </button>
            <button
              type="button"
              disabled={!selected}
              className="w-full rounded-lg border border-gray-300 py-2 text-xs font-semibold disabled:opacity-40"
              onClick={() =>
                selected && setResult("환불 승인", sharedAdminApproveRefund(selected.id, adminMemo))
              }
            >
              환불 승인
            </button>
            <button
              type="button"
              disabled={!selected}
              className="w-full rounded-lg border border-gray-300 py-2 text-xs font-semibold disabled:opacity-40"
              onClick={() =>
                selected && setResult("환불 거절", sharedAdminRejectRefund(selected.id, adminMemo))
              }
            >
              환불 거절
            </button>
            <input
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
              value={adminMemo}
              onChange={(e) => setAdminMemo(e.target.value)}
              placeholder="승인/거절 메모"
            />
            <button
              type="button"
              disabled={!selected}
              className="w-full rounded-lg border border-amber-300 py-2 text-xs font-semibold text-amber-950 disabled:opacity-40"
              onClick={() =>
                selected && setResult("정산 보류", sharedAdminHoldSettlement(selected.id, adminReason))
              }
            >
              정산 보류
            </button>
            <button
              type="button"
              disabled={!selected}
              className="w-full rounded-lg border border-teal-300 py-2 text-xs font-semibold text-teal-900 disabled:opacity-40"
              onClick={() =>
                selected && setResult("정산 해제", sharedAdminReleaseSettlement(selected.id, adminMemo))
              }
            >
              정산 해제
            </button>
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-bold text-gray-800">선택 주문 미리보기 (JSON)</h3>
          <pre className="max-h-[320px] overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] leading-relaxed text-emerald-100">
            {selected ? JSON.stringify(selected, null, 2) : "// 주문을 선택하세요"}
          </pre>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-bold text-gray-800">로그 (선택 주문)</h3>
          <pre className="max-h-[320px] overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] leading-relaxed text-sky-100">
            {selected
              ? JSON.stringify(selected.logs, null, 2)
              : "// 주문을 선택하세요"}
          </pre>
        </div>
      </div>

      <p className="text-[11px] text-gray-500">
        검증:{" "}
        <Link className="underline" href="/mypage/store-orders">
          회원 주문
        </Link>
        {" · "}
        <Link className="underline" href="/my/business/store-orders">
          오너 주문
        </Link>
        {" · "}
        <Link className="underline" href="/admin/delivery-orders">
          관리자 주문
        </Link>
      </p>
    </div>
  );
}
