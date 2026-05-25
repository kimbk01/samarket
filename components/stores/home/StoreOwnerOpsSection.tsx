"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useStoreBusinessHubEntryModal } from "@/hooks/use-store-business-hub-entry-modal";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { buildMyBusinessNavGroups } from "@/lib/business/my-business-nav";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { formatStoreApprovalStatusI18n } from "@/lib/stores/store-approval-label-ko";
import { shouldInterceptBusinessHubHref } from "@/lib/stores/store-business-hub-nav-intercept";
import { OwnerRoutes } from "@/lib/business/owner-routes";

const PREFERRED_SHORTCUT_PATTERNS: readonly RegExp[] = [
  /\/stores\/owner\/orders(?:\?|$)/,
  /\/stores\/owner\/inquiries(?:\?|$)/,
  /\/stores\/owner\/settlements(?:\?|$)/,
  /\/stores\/owner\/profile(?:\?|$)/,
  /^\/stores\/[^/]+$/,
  /\/stores\/owner\/products(?:\?|$)/,
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
  const { t } = useI18n();
  const { goBusinessHubOrModal, hubBlockedModal, openBlockedModalIfNeeded } =
    useStoreBusinessHubEntryModal(t("common_confirm"));
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
    const preferred = PREFERRED_SHORTCUT_PATTERNS.map((pattern) =>
      items.find((item) => pattern.test(item.href ?? ""))
    ).filter((item): item is NonNullable<(typeof items)[number]> => !!item) as OpsShortcut[];
    if (preferred.length > 0) return preferred;
    return [
      { label: t("store_hub_ops_center"), href: OwnerRoutes.hub(ownerStore.id) },
      { label: t("store_hub_ops_basic_info"), href: OwnerRoutes.basicInfo(ownerStore.id) },
      { label: t("store_hub_ops_review_status"), href: OwnerRoutes.opsStatus(ownerStore.id) },
      { label: t("biz_nav_store_settings"), href: OwnerRoutes.profile(ownerStore.id) },
    ];
  }, [ownerStore, ownerOrderAttention, t]);

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
                <h2 className="truncate sam-text-body font-bold text-violet-950">{t("store_ops_title")}</h2>
                <span className="shrink-0 rounded-full bg-violet-600 px-2 py-0.5 sam-text-xxs font-bold text-white">
                  OWNER
                </span>
              </>
            : <h2 className="truncate sam-text-body-secondary font-bold text-violet-950">{t("store_owner_shortcut_title")}</h2>}
          </div>
          {String(ownerStore.approval_status) !== "approved" || !ownerStore.is_visible ?
            <p className="truncate sam-text-xxs font-medium text-amber-900/90">
              {t("store_hub_ops_review_exposure")}{" "}
              {String(ownerStore.approval_status) === "approved" && !ownerStore.is_visible ?
                t("store_hub_ops_approved_hidden")
              : `${formatStoreApprovalStatusI18n(ownerStore.approval_status, t)} · ${t("store_hub_ops_check_in_center")}`}
            </p>
          : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {hubAttentionSlot}
          {ownerStoreTabAttention > 0 ?
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 sam-text-xxs font-bold text-white">
              {ownerStoreTabAttention > 99 ? "99+" : ownerStoreTabAttention}
            </span>
          : null}
        </div>
      </div>

      <HorizontalDragScroll className={RAIL} aria-label={t("store_ops_menu_aria")}>
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
            <span className="line-clamp-2 sam-text-xxs font-bold leading-tight text-violet-950">{item.label}</span>
            {typeof item.badge === "number" && item.badge > 0 ?
              <span className="mt-1 sam-text-xxs font-bold text-red-600">{item.badge}</span>
            : null}
          </Link>
        ))}
      </HorizontalDragScroll>

      <div className={`mt-2 ${RAIL}`}>
        <button
          type="button"
          onClick={() =>
            goBusinessHubOrModal(OwnerRoutes.hub(ownerStore.id))
          }
          className="shrink-0 rounded-full border border-violet-200 bg-violet-600/10 px-4 py-2 sam-text-xxs font-bold text-violet-950"
        >
          {t("store_hub_ops_all_menu")}
        </button>
        {ownerStore.slug ?
          <Link
            href={`/stores/${encodeURIComponent(ownerStore.slug)}`}
            className="shrink-0 rounded-full border border-sam-border bg-sam-surface px-4 py-2 sam-text-xxs font-semibold text-sam-fg"
          >
            {t("store_hub_ops_my_store")}
          </Link>
        : null}
      </div>
    </section>
  );
}
