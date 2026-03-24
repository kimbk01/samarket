"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  getDemoBuyerUserId,
  listMemberOrderStatusEventsForBuyer,
} from "@/lib/member-orders/member-order-store";
import { useMemberOrdersVersion } from "@/lib/member-orders/use-member-orders-store";

export function MemberOrderStatusHistoryContent() {
  const v = useMemberOrdersVersion();
  const buyerId = getDemoBuyerUserId();

  const rows = useMemo(() => {
    void v;
    return listMemberOrderStatusEventsForBuyer(buyerId);
  }, [buyerId, v]);

  if (!buyerId) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        회원 역할로 전환한 뒤 상태 이력을 확인하세요.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl bg-white p-4 text-sm text-gray-500 ring-1 ring-gray-100">
        아직 단계 기록이 없어요. 샘플 주문을 진행하면 여기에 쌓여요.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.id}
          className="rounded-xl border border-gray-100 bg-white px-3 py-3 shadow-sm ring-1 ring-gray-50"
        >
          <div className="flex flex-wrap justify-between gap-1 text-[11px] text-gray-400">
            <span className="font-mono">{r.status}</span>
            <span>{new Date(r.created_at).toLocaleString("ko-KR")}</span>
          </div>
          <p className="mt-1 text-[14px] font-semibold text-gray-900">
            {r.store_name}
            <span className="ml-1.5 font-mono text-[12px] font-normal text-gray-500">
              {r.order_no}
            </span>
          </p>
          <p className="mt-0.5 text-[13px] text-gray-700">{r.message}</p>
          <div className="mt-2">
            <Link
              href="/mypage/store-orders"
              className="text-[12px] font-medium text-violet-700 underline"
            >
              실매장 주문 내역 보기
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
