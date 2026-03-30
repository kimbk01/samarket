"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import {
  filterMemberOrdersByTab,
  getDemoBuyerUserId,
  listMemberOrdersForBuyer,
  requestMemberOrderCancel,
  resetMemberOrdersMock,
} from "@/lib/member-orders/member-order-store";
import type { MemberOrder, MemberOrderTab } from "@/lib/member-orders/types";
import { useMemberOrdersVersion } from "@/lib/member-orders/use-member-orders-store";
import { CancelOrderRequestModal } from "./CancelOrderRequestModal";
import { MemberNotificationBell } from "./MemberNotificationBell";
import { MemberOrderList } from "./MemberOrderList";
import { MemberOrderTabs } from "./MemberOrderTabs";

const BASE = "/mypage/store-orders";

export function MemberOrdersPageClient() {
  const v = useMemberOrdersVersion();
  const buyerId = getDemoBuyerUserId();
  const [tab, setTab] = useState<MemberOrderTab>("all");
  const [toast, setToast] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MemberOrder | null>(null);

  const all = useMemo(() => {
    void v;
    return listMemberOrdersForBuyer(buyerId);
  }, [buyerId, v]);

  const filtered = useMemo(() => {
    const rows = filterMemberOrdersByTab(all, tab);
    return [...rows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [all, tab]);

  const counts = useMemo(() => {
    const keys: MemberOrderTab[] = ["all", "active", "done", "issue"];
    const o: Record<MemberOrderTab, number> = {
      all: 0,
      active: 0,
      done: 0,
      issue: 0,
    };
    for (const k of keys) o[k] = filterMemberOrdersByTab(all, k).length;
    return o;
  }, [all]);

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white px-2 py-2">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <AppBackButton backHref="/my" />
          <h1 className="min-w-0 flex-1 truncate text-center text-[16px] font-bold text-gray-900">
            배달 주문
          </h1>
          <div className="flex shrink-0 items-center gap-1">
            <MemberNotificationBell />
            <button
              type="button"
              className="shrink-0 text-[11px] text-gray-500 underline"
              onClick={() => {
                if (confirm("샘플 주문 데이터를 초기화할까요?")) resetMemberOrdersMock();
              }}
            >
              초기화
            </button>
          </div>
        </div>
        <p className="mx-auto max-w-lg px-3 pb-2 text-center text-[11px] text-gray-500">
          시뮬레이션 데이터 · 역할별 화면은 세션에 따라 달라질 수 있어요
        </p>
      </header>

      <div className="mx-auto max-w-lg space-y-4 px-3 pt-4">
        {toast ? (
          <p className="rounded-xl bg-gray-900 px-3 py-2 text-center text-xs text-white">{toast}</p>
        ) : null}

        {!buyerId ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-center text-xs text-amber-950">
            회원 주문 내역은 <strong>회원</strong> 역할로 접속했을 때만 표시돼요.
          </p>
        ) : null}

        <MemberOrderTabs active={tab} onChange={setTab} counts={counts} />

        <p className="text-xs text-gray-500">
          <Link href="/orders?tab=chat" className="text-violet-700 underline">
            주문 채팅 목록
          </Link>
          {" · "}
          매장 주문 목록은{" "}
          <Link href="/mypage/store-orders" className="text-violet-700 underline">
            매장 주문 내역
          </Link>
          에서 확인해요.
        </p>

        <MemberOrderList
          orders={filtered}
          basePath={BASE}
          onOpenCancel={setCancelTarget}
        />
      </div>

      <CancelOrderRequestModal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={(label, detail) => {
          if (!cancelTarget) return;
          const r = requestMemberOrderCancel(buyerId, cancelTarget.id, label, detail);
          setToast(r.ok ? "취소 요청이 접수되었어요." : r.error);
          setTimeout(() => setToast(null), 2800);
        }}
      />
    </div>
  );
}
