"use client";

import Link from "next/link";

function Step({
  done,
  children,
}: {
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-2.5 sam-text-body-secondary leading-snug">
      <span
        className={`mt-0.5 shrink-0 font-semibold ${done ? "text-emerald-600" : "text-sam-meta"}`}
        aria-hidden
      >
        {done ? "✓" : "○"}
      </span>
      <div className="min-w-0 text-sam-fg">{children}</div>
    </li>
  );
}

/** 심사 중 — 다음에 할 일 안내 */
export function BusinessOperationalChecklistPending({
  storeId,
  shopName,
}: {
  storeId: string;
  shopName: string;
}) {
  return (
    <section
      className="rounded-ui-rect border border-amber-200 bg-amber-50/80 p-4"
      aria-label="매장 오픈 순서"
    >
      <h2 className="sam-text-body font-semibold text-amber-950">오픈 준비 순서</h2>
      <p className="mt-1 sam-text-helper text-amber-900/90">
        <span className="font-medium text-sam-fg">{shopName}</span> 심사가 진행 중입니다. 아래 순서를
        참고하세요.
      </p>
      <ol className="mt-3 list-none space-y-2 pl-0">
        <Step done>매장 신청 완료</Step>
        <Step done={false}>
          <span className="font-medium text-amber-950">운영자 매장 심사</span>
          <span className="mt-0.5 block sam-text-helper text-amber-900/85">
            승인되면 동네 피드·매장 탭에 노출될 수 있습니다.
          </span>
        </Step>
        <Step done={false}>
          <span className="font-medium">지금 할 수 있는 일: 프로필·이미지 입력</span>
          <Link
            href={`/my/business/profile?storeId=${encodeURIComponent(storeId)}`}
            className="mt-1 inline-block font-medium text-signature underline"
          >
            매장 프로필 열기 →
          </Link>
        </Step>
        <Step done={false}>
          승인 후: 메뉴·상품 등록 → 관리자 <strong>판매 승인</strong> 시 고객에게 판매 노출
        </Step>
      </ol>
    </section>
  );
}

/** 보완 요청 — 우선순위 한 줄 */
export function BusinessOperationalChecklistRevision({ storeId }: { storeId: string }) {
  return (
    <section className="rounded-ui-rect border border-amber-300 bg-sam-surface p-4 shadow-sm">
      <h2 className="sam-text-body font-semibold text-sam-fg">우선 처리</h2>
      <p className="mt-1 sam-text-body-secondary text-sam-muted">
        관리자 보완 요청 사항을 반영한 뒤, 다시 제출·심사를 기다려 주세요.
      </p>
      <Link
        href={`/my/business/profile?storeId=${encodeURIComponent(storeId)}`}
        className="mt-3 inline-flex rounded-ui-rect bg-signature px-4 py-2.5 sam-text-body font-medium text-white"
      >
        프로필에서 보완하기
      </Link>
    </section>
  );
}
