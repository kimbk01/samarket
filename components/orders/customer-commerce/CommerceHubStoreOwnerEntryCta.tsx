"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveMypageHomeStoreOwnerEntry } from "@/lib/mypage/mypage-home-menu-config";
import { getOwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { refreshOwnerLiteStore, useOwnerLiteStore } from "@/lib/stores/use-owner-lite-store";
import {
  fetchMeStoresListDeduped,
  invalidateMeStoresListDedupedCache,
  parseStoreRowsFromMeStoresJson,
} from "@/lib/me/fetch-me-stores-deduped";
import { resolveOwnerActiveStoreIdFromOwnedList } from "@/lib/delivery/owner/resolve-owner-active-store";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

/**
 * This mount's `GET /api/me/stores` outcome (same deduped flight OwnerLite refresh uses).
 * OwnerLite stores an empty list for HTTP errors too, so an empty list there cannot
 * prove "no store"; only a 2xx `{ ok: true, stores }` body can.
 */
type MeStoresProbe =
  | { kind: "pending" }
  | { kind: "ok"; stores: StoreRow[] }
  | { kind: "unauthenticated" }
  | { kind: "failed" };

function probeFromMeStoresResult(status: number, json: unknown): MeStoresProbe {
  if (status === 401) return { kind: "unauthenticated" };
  if (status >= 200 && status < 300) {
    const rows = parseStoreRowsFromMeStoresJson(json);
    if (rows) return { kind: "ok", stores: rows };
  }
  return { kind: "failed" };
}

/**
 * Compact store-owner action — independent of content tab geometry.
 * Gate/destination SSOT = resolveMypageHomeStoreOwnerEntry (same as MyPage).
 * Not a content tab; does not participate in ?tab= or tab width distribution.
 *
 * Decided only from this mount's `/api/me/stores` response — never from OwnerLite / me-stores
 * cache rows, which may belong to an earlier session, account or approval state.
 * Pending / failed (5xx, 503, `ok:false`, network) → render nothing (never a false "매장 신청").
 * 401 → apply entry (unchanged legacy behavior).
 */
export function CommerceHubStoreOwnerEntryCta() {
  const { safeT } = useI18n();
  // Kept only for the existing OwnerLite subscription (idle-hydrate scheduling); rows are not read.
  useOwnerLiteStore();
  const [probe, setProbe] = useState<MeStoresProbe>({ kind: "pending" });

  useEffect(() => {
    let cancelled = false;
    // Invalidates the me-stores cache and starts the deduped flight; the call below joins it.
    void refreshOwnerLiteStore();
    fetchMeStoresListDeduped().then(
      ({ status, json }) => {
        if (!cancelled) setProbe(probeFromMeStoresResult(status, json));
      },
      () => {
        if (!cancelled) setProbe({ kind: "failed" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const resolveStores = (): StoreRow[] | null => {
    if (probe.kind === "ok") return probe.stores;
    if (probe.kind === "unauthenticated") return [];
    return null;
  };

  const stores = resolveStores();
  if (stores === null) return null;

  const deriveFromLive = () => {
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
