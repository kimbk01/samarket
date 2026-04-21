"use client";

import Link from "next/link";

const ROW_CLASS =
  "flex items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 active:bg-sam-primary-soft";

export function MyOrderRelatedSection() {
  return (
    <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
      <h2 className="mb-2 px-1 sam-text-body-secondary font-semibold text-muted">주문 관련 항목</h2>
      <div className="space-y-2">
        <Link href="/my/store-orders" className={ROW_CLASS}>
          <div className="min-w-0 flex-1 pr-2">
            <p className="sam-text-body font-medium text-foreground">배달 주문 내역</p>
            <p className="mt-0.5 sam-text-helper text-muted">포장 픽업·배달 주문 목록과 상세</p>
          </div>
          <Chevron />
        </Link>
        <Link href="/mypage/notifications" className={ROW_CLASS}>
          <div className="min-w-0 flex-1 pr-2">
            <p className="sam-text-body font-medium text-foreground">주문·알림</p>
            <p className="mt-0.5 sam-text-helper text-muted">알림 센터에서 확인</p>
          </div>
          <Chevron />
        </Link>
      </div>
    </section>
  );
}

function Chevron() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="shrink-0 text-muted"
      aria-hidden
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
