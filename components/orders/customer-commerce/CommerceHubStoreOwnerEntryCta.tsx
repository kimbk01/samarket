"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveMypageHomeStoreOwnerEntry } from "@/lib/mypage/mypage-home-menu-config";
import { getOwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { refreshOwnerLiteStore, useOwnerLiteStore } from "@/lib/stores/use-owner-lite-store";
import {
  invalidateMeStoresListDedupedCache,
  parseStoreRowsFromMeStoresJson,
  peekMeStoresListClientCache,
} from "@/lib/me/fetch-me-stores-deduped";
import { resolveOwnerActiveStoreIdFromOwnedList } from "@/lib/delivery/owner/resolve-owner-active-store";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

/**
 * Commerce hub top-chrome trailing owner CTA (Option B).
 * Presentation only — Gate/destination SSOT = resolveMypageHomeStoreOwnerEntry (same as MyPage).
 * Not a content tab; does not participate in ?tab= contract.
 */
export function CommerceHubStoreOwnerEntryCta() {
  const { safeT } = useI18n();
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

  return (
    <Link
      href={ownerEntry.href}
      prefetch={false}
      title={title}
      className="relative flex max-w-[6.75rem] shrink-0 items-center justify-center self-stretch border-l border-sam-border px-2 text-center text-[11px] font-semibold leading-tight text-signature sm:max-w-[8.5rem] sm:px-2.5 sm:text-xs"
      data-commerce-hub-owner-cta="1"
      data-commerce-hub-seller-cta="1"
      data-commerce-hub-seller-gate={derived.gate?.kind ?? "empty"}
      data-commerce-hub-seller-href={ownerEntry.href}
      onClick={isApproved ? prepareStoreEnterNavigation : undefined}
    >
      <span className="line-clamp-2 break-keep">{title}</span>
    </Link>
  );
}
