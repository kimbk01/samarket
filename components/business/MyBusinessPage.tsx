"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BUSINESS_PROFILE_STATUS_KEYS } from "@/lib/business/business-owner-ui-labels";
import {
  BusinessOperationalChecklistPending,
  BusinessOperationalChecklistRevision,
} from "./BusinessOperationalChecklist";
import type { BusinessProduct, BusinessProfile } from "@/lib/types/business";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import {
  dbStoreProductToBusinessProduct,
  dbStoreToBusinessProfile,
  type StoreProductRow,
  type StoreRow,
} from "@/lib/stores/db-store-mapper";
import { pickPreferredOwnerStore } from "@/lib/stores/owner-lite-external-store";
import { storeRowCanSell } from "@/lib/business/store-can-sell";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import {
  fetchOwnerStoreProductsForHub,
  mergeOwnerHubProductCount,
} from "@/lib/business/hydrate-owner-store-products-client";
import {
  cancelOwnerHubSecondaryFetchKey,
  OWNER_HUB_SECONDARY_AFTER_MS,
  scheduleOwnerHubSecondaryFetch,
} from "@/lib/business/owner-hub-secondary-fetch-queue";
import { useOwnerHubRuntime } from "@/components/business/owner/OwnerHubRuntimeProvider";
import { BusinessAdminDashboard } from "@/components/business/admin/dashboard/BusinessAdminDashboard";
import type { MyBusinessServerInitial } from "@/lib/business/load-my-business-server";
import type { OwnerHubDashboardPack } from "@/lib/business/load-owner-hub-dashboard-server";
import {
  buildOwnerHubLoadStateFromMeStoresPeek,
  buildOwnerHubLoadStateFromMeStoresResult,
  buildOwnerHubLoadStateFromStoreRows,
  type OwnerHubPageLoadState,
} from "@/lib/business/build-owner-hub-load-state";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getOwnerLiteStoreSnapshot,
  subscribeOwnerLiteStore,
} from "@/lib/stores/owner-lite-external-store";

type LoadState = { kind: "loading" } | OwnerHubPageLoadState;

function loadStateFromServerInitial(s: MyBusinessServerInitial): OwnerHubPageLoadState {
  switch (s.kind) {
    case "unauth":
      return { kind: "unauth" };
    case "config":
      return { kind: "config" };
    case "error":
      return { kind: "error", message: s.message };
    case "empty":
      return { kind: "empty" };
    case "remote":
      return {
        kind: "remote",
        row: s.row,
        profile: s.profile,
        products: s.products,
        dashboard: s.dashboard ?? null,
      };
  }
}

export function MyBusinessPage({
  initialServerState,
}: {
  initialServerState?: MyBusinessServerInitial | null;
} = {}) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const preferredStoreId = searchParams.get("storeId")?.trim() ?? "";

  const [state, setState] = useState<LoadState>(() => {
    if (initialServerState == null) return { kind: "loading" };
    const fromServer = loadStateFromServerInitial(initialServerState);
    if (fromServer.kind !== "empty") return fromServer;
    return buildOwnerHubLoadStateFromMeStoresPeek(preferredStoreId) ?? fromServer;
  });
  /** RSC `empty` 이지만 클라 세션·캐시에 매장이 있을 때 — 신청 CTA 깜빡임 방지 */
  const [clientStoresProbe, setClientStoresProbe] = useState<"pending" | "done">(() =>
    initialServerState?.kind === "empty" ? "pending" : "done"
  );
  const hubRuntime = useOwnerHubRuntime();
  const orderAlertsBadge = hubRuntime?.orderAlertsBadge ?? 0;

  const loadRemote = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setState({ kind: "loading" });
    }
    try {
      const { status, json: rawStores } = await fetchMeStoresListDeduped();
      const json = rawStores as { ok?: boolean; error?: string; stores?: StoreRow[] };
      if (status === 401) {
        setState({ kind: "unauth" });
        return;
      }
      if (status === 503) {
        setState({ kind: "config" });
        return;
      }
      if (!json?.ok) {
        setState({
          kind: "error",
          message: typeof json?.error === "string" ? json.error : "load_failed",
        });
        return;
      }
      const stores = (json.stores ?? []) as StoreRow[];
      if (stores.length === 0) {
        setState({ kind: "empty" });
        return;
      }
      const byPreferred =
        preferredStoreId.length > 0 ? stores.find((s) => s.id === preferredStoreId) : undefined;
      const row = byPreferred ?? pickPreferredOwnerStore(stores) ?? stores[0]!;
      let products: BusinessProduct[] = [];
      if (row.approval_status === "approved") {
        const pr = await fetch(`/api/me/stores/${row.id}/products`, {
          credentials: "include",
        });
        const pj = await pr.json();
        if (pj?.ok && Array.isArray(pj.products)) {
          products = pj.products.map((p: StoreProductRow) =>
            dbStoreProductToBusinessProduct(p, row.id)
          );
        }
      }
      const baseProfile = dbStoreToBusinessProfile(row);
      const profile: BusinessProfile = {
        ...baseProfile,
        productCount: products.length,
      };
      setState((prev) => ({
        kind: "remote",
        row,
        profile,
        products,
        dashboard:
          prev.kind === "remote" && prev.row.id === row.id ? prev.dashboard : null,
      }));
    } catch {
      setState({ kind: "error", message: "network_error" });
    }
  }, [preferredStoreId]);

  const needsProductsHydrate =
    initialServerState?.kind === "remote" &&
    initialServerState.row.approval_status === "approved" &&
    initialServerState.products.length === 0;

  const productsHydrateStoreIdRef = useRef(
    needsProductsHydrate && initialServerState?.kind === "remote" ?
      initialServerState.row.id
    : null
  );
  const productsHydrateGenRef = useRef(0);

  useEffect(() => {
    const storeId = productsHydrateStoreIdRef.current;
    if (!storeId) return;
    const gen = ++productsHydrateGenRef.current;
    scheduleOwnerHubSecondaryFetch(
      async () => {
        const products = await fetchOwnerStoreProductsForHub(storeId);
        if (gen !== productsHydrateGenRef.current) return;
        setState((prev) => {
          if (prev.kind !== "remote" || prev.row.id !== storeId) return prev;
          return {
            ...prev,
            products,
            profile: mergeOwnerHubProductCount(prev.profile, products),
          };
        });
      },
      { afterMs: OWNER_HUB_SECONDARY_AFTER_MS.products, key: "products" }
    );
    return () => {
      productsHydrateGenRef.current += 1;
      cancelOwnerHubSecondaryFetchKey("products");
    };
  }, [needsProductsHydrate]);

  useLayoutEffect(() => {
    if (clientStoresProbe !== "pending") return;
    const fromPeek = buildOwnerHubLoadStateFromMeStoresPeek(preferredStoreId);
    if (fromPeek && fromPeek.kind !== "empty") {
      setState(fromPeek);
      setClientStoresProbe("done");
      return;
    }
    let cancelled = false;
    void fetchMeStoresListDeduped().then((result) => {
      if (cancelled) return;
      const next = buildOwnerHubLoadStateFromMeStoresResult(preferredStoreId, result);
      if (next) setState(next);
      setClientStoresProbe("done");
    });
    return () => {
      cancelled = true;
    };
  }, [clientStoresProbe, preferredStoreId]);

  const ownerLiteReconcileRef = useRef(false);
  useEffect(() => {
    if (state.kind !== "empty" || ownerLiteReconcileRef.current) return;
    return subscribeOwnerLiteStore(() => {
      if (ownerLiteReconcileRef.current) return;
      const snap = getOwnerLiteStoreSnapshot();
      if (!snap.ownerStores.length || snap.loading) return;
      ownerLiteReconcileRef.current = true;
      setState(buildOwnerHubLoadStateFromStoreRows(snap.ownerStores, preferredStoreId));
      setClientStoresProbe("done");
    });
  }, [state.kind, preferredStoreId]);

  useEffect(() => {
    if (initialServerState != null) return;
    void loadRemote();
  }, [initialServerState, loadRemote]);

  if (state.kind === "loading") {
    return <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>;
  }

  if (state.kind === "unauth") {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} rounded-ui-rect bg-amber-50 p-4 sam-text-body text-amber-900`}>
        <p>{t("auth_resource_access_denied")}</p>
      </div>
    );
  }

  if (state.kind === "config") {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} sam-text-body text-sam-muted`}>
        <p>{t("business_phase7_281")}</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <p className="sam-text-body text-red-600">{t("business_phase7_083", { v1: state.message })}</p>
        <button
          type="button"
          onClick={() => void loadRemote()}
          className="rounded-ui-rect border border-sam-border px-4 py-2 sam-text-body text-sam-fg"
        >
          {t("business_phase7_466")}
        </button>
      </div>
    );
  }

  if (state.kind === "empty") {
    if (clientStoresProbe === "pending") {
      return <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>;
    }
    return (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <div className="rounded-ui-rect bg-[color:var(--dibay-green)] px-5 py-5 text-sam-on-primary shadow-sam-elevated md:px-6 md:py-6">
          <p className="sam-text-helper font-medium text-sam-on-primary/70">{t("business_phase7_108")}</p>
          <h2 className="mt-1 sam-text-page-title font-bold leading-tight md:sam-text-hero">
            {t("business_phase7_607")}
          </h2>
          <p className="mt-2 sam-text-body-secondary text-sam-on-primary/75">
            {t("business_phase7_608")}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link
            href="/stores/owner/apply"
            className="rounded-ui-rect border border-signature/30 bg-signature/5 px-4 py-4 sam-text-body font-semibold text-sam-fg shadow-sm"
          >
            {t("mypage_hub_store_apply")}
          </Link>
          <Link
            href="/mypage/store-orders"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-4 sam-text-body font-semibold text-sam-fg shadow-sm"
          >
            {t("mypage_hub_my_orders")}
          </Link>
        </div>
      </div>
    );
  }

  const { row, profile, products, dashboard } = state;
  const canSell = storeRowCanSell(row);
  const managementQuery = `storeId=${encodeURIComponent(row.id)}`;

  if (row.approval_status === "revision_requested") {
    return (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <BusinessOperationalChecklistRevision storeId={row.id} />
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 p-4">
          <h2 className="sam-text-body-lg font-semibold text-sam-fg">{profile.shopName}</h2>
          <p className="mt-2 sam-text-body text-amber-900">{t("business_phase7_033")}</p>
          {profile.adminMemo ? (
            <p className="mt-2 whitespace-pre-wrap sam-text-body-secondary text-sam-fg">{profile.adminMemo}</p>
          ) : null}
          <Link
            href={`/stores/owner/profile?${managementQuery}`}
            className="mt-3 inline-block rounded-ui-rect bg-signature px-4 py-2.5 text-center sam-text-body font-medium text-white"
          >
            {t("business_phase7_609")}
          </Link>
        </div>
        <button
          type="button"
          onClick={() => void loadRemote()}
          className="sam-text-body text-signature underline"
        >
          {t("store_owner_refresh")}
        </button>
      </div>
    );
  }

  if (profile.status === "pending") {
    return (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <BusinessOperationalChecklistPending storeId={row.id} shopName={profile.shopName} />
        <div className={`${OWNER_STORE_STACK_Y_CLASS} rounded-ui-rect bg-sam-surface p-4 shadow-sm`}>
          <h2 className="sam-text-body-lg font-semibold text-sam-fg">{profile.shopName}</h2>
          <p className="sam-text-body text-sam-muted">{t("business_phase7_181")}</p>
          <span className="mt-2 inline-block rounded bg-amber-100 px-2 py-1 sam-text-body-secondary text-amber-800">
            {t(BUSINESS_PROFILE_STATUS_KEYS.pending)}
          </span>
          <Link
            href={`/stores/owner/profile?${managementQuery}`}
            className="mt-3 inline-block rounded-ui-rect border border-sam-border px-4 py-2 sam-text-body font-medium text-sam-fg"
          >
            {t("business_phase7_610")}
          </Link>
        </div>
      </div>
    );
  }

  if (profile.status === "rejected") {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} rounded-ui-rect bg-sam-surface p-4 shadow-sm`}>
        <h2 className="sam-text-body-lg font-semibold text-sam-fg">{profile.shopName}</h2>
        <p className="sam-text-body text-sam-muted">{t("business_phase7_179")}</p>
        {profile.adminMemo ? (
          <p className="sam-text-body-secondary text-sam-fg">{t("business_phase7_136", { v1: profile.adminMemo })}</p>
        ) : null}
        <span className="inline-block rounded bg-red-50 px-2 py-1 sam-text-body-secondary text-red-700">
          {t(BUSINESS_PROFILE_STATUS_KEYS.rejected)}
        </span>
      </div>
    );
  }

  if (profile.status === "paused") {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} rounded-ui-rect bg-sam-surface p-4 shadow-sm`}>
        <h2 className="sam-text-body-lg font-semibold text-sam-fg">{profile.shopName}</h2>
        <p className="sam-text-body text-sam-muted">{t("business_phase7_227")}</p>
        <span className="inline-block rounded bg-sam-border-soft px-2 py-1 sam-text-body-secondary text-sam-fg">
          {t(BUSINESS_PROFILE_STATUS_KEYS.paused)}
        </span>
      </div>
    );
  }

  return (
    <BusinessAdminDashboard
      row={row}
      profile={profile}
      products={products}
      canSell={canSell}
      orderAlertsBadge={orderAlertsBadge}
      initialDashboard={dashboard}
      loadRemote={loadRemote}
    />
  );
}
