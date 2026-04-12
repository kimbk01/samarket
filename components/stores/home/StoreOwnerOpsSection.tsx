"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useStoreBusinessHubEntryModal } from "@/hooks/use-store-business-hub-entry-modal";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { buildMyBusinessNavGroups } from "@/lib/business/my-business-nav";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { formatStoreApprovalStatusKo } from "@/lib/stores/store-approval-label-ko";
import { shouldInterceptBusinessHubHref } from "@/lib/stores/store-business-hub-nav-intercept";

const PREFERRED_SHORTCUTS = [
  "주문 관리",
  "받은 문의",
  "정산 내역",
  "매장 설정",
  "공개 매장 페이지",
  "상품 등록",
] as const;

const RAIL =
  "flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

type OpsShortcut = { label: string; href: string; badge?: number };

export function StoreOwnerOpsSection({
  ownerStore,
  ownerStoreTabAttention,
  ownerOrderAttention,
  hubAttentionSlot,
  embedded = false,
}: {
  ownerStore: StoreRow;
  /** 주문·문의·배달채팅 등 매장 탭 할 일 — 카드 헤더 뱃지 */
  ownerStoreTabAttention: number;
  /** 신규·환불요청 등 주문 처리 건 — `주문 관리` 숏컷 배지 */
  ownerOrderAttention: number;
  hubAttentionSlot?: ReactNode;
  embedded?: boolean;
}) {
  const { goBusinessHubOrModal, hubBlockedModal, openBlockedModalIfNeeded } =
    useStoreBusinessHubEntryModal("확인");
  const shortcuts = useMemo((): OpsShortcut[] => {
    const groups = buildMyBusinessNavGroups({
      storeId: ownerStore.id,
      slug: ownerStore.slug ?? "",
      approvalStatus: String(ownerStore.approval_status),
      isVisible: ownerStore.is_visible === true,
      canSell:
        !!ownerStore.sales_permission &&
        ownerStore.sales_permission.allowed_to_sell === true &&
        ownerStore.sales_permission.sales_status === "approved",
      orderAlertsBadge: ownerOrderAttention,
    });
    const items = groups.flatMap((g) => g.items).filter((item) => item.href && !item.disabled);
    const preferred = PREFERRED_SHORTCUTS.map((label) => items.find((item) => item.label === label)).filter(
      (item): item is NonNullable<(typeof items)[number]> => !!item
    ) as OpsShortcut[];
    if (preferred.length > 0) return preferred;
    const sid = encodeURIComponent(ownerStore.id);
    const q = `storeId=${sid}`;
    return [
      { label: "운영 센터", href: `/my/business?${q}` },
      { label: "기본 정보", href: `/my/business/basic-info?${q}` },
      { label: "매장 설정", href: `/my/business/profile?${q}` },
      { label: "심사 상태", href: `/my/business/ops-status?${q}` },
    ];
  }, [ownerStore, ownerOrderAttention]);

  return (
    <section
      id="owner-operations"
      className={
        embedded ?
          "scroll-mt-28 rounded-ui-rect border border-violet-100 bg-violet-50/40 p-2"
        : "scroll-mt-28 rounded-ui-rect border border-violet-200/60 bg-gradient-to-r from-violet-50/90 to-white p-3 shadow-sm ring-1 ring-violet-100/80"
      }
    >
      {hubBlockedModal}
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            {!embedded ?
              <>
                <h2 className="truncate text-[15px] font-bold text-violet-950">매장 운영</h2>
                <span className="shrink-0 rounded-full bg-violet-600 px-2 py-0.5 text-[9px] font-bold text-white">
                  OWNER
                </span>
              </>
            : <h2 className="truncate text-[13px] font-bold text-violet-950">매장주 바로가기</h2>}
          </div>
          {String(ownerStore.approval_status) !== "approved" || !ownerStore.is_visible ?
            <p className="truncate text-[11px] font-medium text-amber-900/90">
              심사·노출:{" "}
              {String(ownerStore.approval_status) === "approved" && !ownerStore.is_visible ?
                "승인됨 · 고객 목록 비노출"
              : `${formatStoreApprovalStatusKo(ownerStore.approval_status)} · 운영 센터에서 확인`}
            </p>
          : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {hubAttentionSlot}
          {ownerStoreTabAttention > 0 ?
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {ownerStoreTabAttention > 99 ? "99+" : ownerStoreTabAttention}
            </span>
          : null}
        </div>
      </div>

      <HorizontalDragScroll className={RAIL} aria-label="매장 운영 메뉴">
        {shortcuts.map((item) => (
          <Link
            key={item.label}
            href={item.href!}
            onClick={(e) => {
              if (shouldInterceptBusinessHubHref(item.href!) && openBlockedModalIfNeeded()) {
                e.preventDefault();
              }
            }}
            className="flex w-[104px] shrink-0 flex-col items-center justify-center rounded-ui-rect border border-violet-100 bg-sam-surface px-2 py-3 text-center shadow-sm"
          >
            <span className="line-clamp-2 text-[11px] font-bold leading-tight text-violet-950">{item.label}</span>
            {typeof item.badge === "number" && item.badge > 0 ?
              <span className="mt-1 text-[9px] font-bold text-red-600">{item.badge}</span>
            : null}
          </Link>
        ))}
      </HorizontalDragScroll>

      <div className={`mt-2 ${RAIL}`}>
        <button
          type="button"
          onClick={() =>
            goBusinessHubOrModal(`/my/business?storeId=${encodeURIComponent(ownerStore.id)}`)
          }
          className="shrink-0 rounded-full border border-violet-200 bg-violet-600/10 px-4 py-2 text-[11px] font-bold text-violet-950"
        >
          전체 메뉴
        </button>
        {ownerStore.slug ?
          <Link
            href={`/stores/${encodeURIComponent(ownerStore.slug)}`}
            className="shrink-0 rounded-full border border-sam-border bg-sam-surface px-4 py-2 text-[11px] font-semibold text-sam-fg"
          >
            내 매장
          </Link>
        : null}
      </div>
    </section>
  );
}
