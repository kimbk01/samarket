"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveMypageHomeStoreOwnerEntry } from "@/lib/mypage/mypage-home-menu-config";
import { getOwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { formatStoreApprovalStatusI18n } from "@/lib/stores/store-approval-label-ko";
import { refreshOwnerLiteStore, useOwnerLiteStore } from "@/lib/stores/use-owner-lite-store";
import {
  invalidateMeStoresListDedupedCache,
  parseStoreRowsFromMeStoresJson,
  peekMeStoresListClientCache,
} from "@/lib/me/fetch-me-stores-deduped";
import { resolveOwnerActiveStoreIdFromOwnedList } from "@/lib/delivery/owner/resolve-owner-active-store";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { Sam } from "@/lib/ui/sam-component-classes";

/**
 * Seller transition on /orders/activity — presentation only.
 * Gate/destination SSOT = resolveMypageHomeStoreOwnerEntry (same as MyPage).
 */
export function CommerceHubSellerTransitionSection() {
  const { safeT, t } = useI18n();
  const ownerLite = useOwnerLiteStore();

  useEffect(() => {
    void refreshOwnerLiteStore();
  }, []);

  const deriveFromLive = () => {
    const storesFromLite = ownerLite.ownerStores;
    let stores: StoreRow[] = storesFromLite;
    if (stores.length === 0) {
      const peek = peekMeStoresListClientCache();
      const fromPeek = peek ? parseStoreRowsFromMeStoresJson(peek.json) : null;
      if (fromPeek && fromPeek.length > 0) stores = fromPeek;
    }
    const forGate = stores.map((s) => ({
      id: s.id,
      approval_status: String(s.approval_status ?? ""),
      rejected_reason: s.rejected_reason ?? null,
      revision_note: s.revision_note ?? null,
    }));
    const gate = getOwnerStoreGateState(forGate);
    const firstId = resolveOwnerActiveStoreIdFromOwnedList(stores, null);
    return { gate, firstId };
  };

  const derived = deriveFromLive();
  const ownerEntry = resolveMypageHomeStoreOwnerEntry(derived.gate, derived.firstId);
  const badgeStatus = ownerEntry.approvalStatusForBadge;
  const accessory =
    badgeStatus != null && String(badgeStatus).trim()
      ? formatStoreApprovalStatusI18n(String(badgeStatus), t)
      : null;

  const isApproved = derived.gate.kind === "approved";
  const isEmpty = !derived.gate || derived.gate.kind === "empty";

  const prepareStoreEnterNavigation = () => {
    invalidateMeStoresListDedupedCache();
    refreshOwnerLiteStore();
  };

  const title = safeT(ownerEntry.titleKey, {
    fallbackKo: isEmpty ? "매장 신청" : isApproved ? "매장 진입" : "매장 승인 진행 사항",
    fallbackEn: isEmpty ? "Apply for store" : isApproved ? "Enter store" : "Store approval progress",
  });

  const blurb = isEmpty
    ? safeT("commerce_hub_seller_blurb_empty", {
        fallbackKo: "dibaY에서 매장을 신청하고 배달 판매를 시작하세요.",
        fallbackEn: "Apply for a store on dibaY and start delivery sales.",
      })
    : isApproved
      ? safeT("commerce_hub_seller_blurb_approved", {
          fallbackKo: "등록된 매장을 관리하고 주문·상품·운영 정보를 확인하세요.",
          fallbackEn: "Manage your store and review orders, products, and operations.",
        })
      : safeT("commerce_hub_seller_blurb_pending", {
          fallbackKo: "매장 신청 진행 상태를 확인하세요.",
          fallbackEn: "Check your store application status.",
        });

  return (
    <section
      className="mt-8 mb-6 min-w-0 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-4"
      data-commerce-hub-seller-section="1"
      data-commerce-hub-seller-gate={derived.gate?.kind ?? "empty"}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-sam-muted">
        {safeT("commerce_hub_seller_section_title", {
          fallbackKo: "판매자 메뉴",
          fallbackEn: "Seller menu",
        })}
      </p>
      <p className="mt-2 text-sm font-semibold text-sam-fg">
        {isEmpty
          ? safeT("commerce_hub_seller_headline_empty", {
              fallbackKo: "매장을 운영하고 싶으신가요?",
              fallbackEn: "Want to run a store?",
            })
          : isApproved
            ? safeT("commerce_hub_seller_headline_approved", {
                fallbackKo: "내 매장",
                fallbackEn: "My store",
              })
            : safeT("commerce_hub_seller_headline_pending", {
                fallbackKo: "매장 신청 현황",
                fallbackEn: "Store application status",
              })}
      </p>
      <p className="mt-1 text-sm text-sam-muted">{blurb}</p>
      {accessory ? (
        <p className="mt-2 text-xs font-medium text-sam-muted" data-commerce-hub-seller-badge="1">
          {accessory}
        </p>
      ) : null}
      <Link
        href={ownerEntry.href}
        prefetch={false}
        className={`${Sam.btn.secondary} mt-3 inline-flex min-h-[44px] w-full items-center justify-center px-3 text-sm font-semibold`}
        data-commerce-hub-seller-cta="1"
        data-commerce-hub-seller-href={ownerEntry.href}
        onClick={isApproved ? prepareStoreEnterNavigation : undefined}
      >
        {title}
      </Link>
    </section>
  );
}
