"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
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
 * Compact store-owner action — independent of content tab geometry.
 * Gate/destination SSOT = resolveMypageHomeStoreOwnerEntry (same as MyPage).
 * Not a content tab; does not participate in ?tab= or tab width distribution.
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
      aria-label={title}
      className="inline-flex max-w-full items-center gap-0.5 truncate text-[12px] font-medium text-signature hover:underline"
      data-commerce-hub-owner-cta="1"
      data-commerce-hub-seller-cta="1"
      data-commerce-hub-seller-gate={derived.gate?.kind ?? "empty"}
      data-commerce-hub-seller-href={ownerEntry.href}
      onClick={isApproved ? prepareStoreEnterNavigation : undefined}
    >
      <span className="truncate break-keep">{title}</span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
    </Link>
  );
}
