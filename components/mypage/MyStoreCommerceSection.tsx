"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { hasApprovedOwnerStore } from "@/lib/stores/store-admin-access";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";

type CommercePhase =
  | { kind: "loading" }
  | { kind: "unauth" }
  | { kind: "ready"; approved: boolean; primaryStoreId: string | null };

async function resolveCommercePhase(): Promise<Exclude<CommercePhase, { kind: "loading" }>> {
  try {
    const { status, json: raw } = await fetchMeStoresListDeduped();
    if (status === 401) {
      return { kind: "unauth" };
    }
    const json = raw as {
      ok?: boolean;
      stores?: { id?: string; approval_status: string }[];
    };
    if (!json?.ok) {
      return { kind: "ready", approved: false, primaryStoreId: null };
    }
    const stores = json.stores ?? [];
    const approved = hasApprovedOwnerStore(stores);
    const approvedRow = stores.find((s) => String(s.approval_status ?? "") === "approved");
    const primaryStoreId =
      approved && approvedRow?.id?.trim() ? approvedRow.id.trim() : null;
    return { kind: "ready", approved, primaryStoreId };
  } catch {
    return { kind: "ready", approved: false, primaryStoreId: null };
  }
}

export function MyStoreCommerceSection() {
  const { t } = useI18n();
  const [phase, setPhase] = useState<CommercePhase>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void resolveCommercePhase().then((p) => {
      if (!cancelled) setPhase(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase.kind === "loading") {
    return (
      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="sam-text-body font-semibold text-sam-fg">{t("mypage_comp_store_section_neighborhood_title")}</h2>
        <div className="mt-3 h-20 animate-pulse rounded-ui-rect bg-sam-surface-muted" />
      </section>
    );
  }

  if (phase.kind === "unauth") {
    return null;
  }

  const { approved, primaryStoreId } = phase;

  if (!approved) {
    return (
      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="sam-text-body font-semibold text-sam-fg">{t("mypage_comp_store_section_owner_title")}</h2>
        <p className="mt-2 sam-text-body-secondary leading-relaxed text-sam-muted">{t("mypage_comp_store_owner_intro")}</p>
        <div className="mt-3 flex flex-col gap-2">
          <Link
            href="/stores/owner/apply"
            className="rounded-ui-rect border border-sam-border bg-sam-surface-muted py-3 text-center sam-text-body-secondary font-medium text-sam-fg"
          >
            {t("mypage_comp_store_owner_cta_apply")}
          </Link>
          <Link href="/my/store-orders" className="text-center sam-text-helper text-sam-muted underline">
            {t("mypage_comp_store_buyer_orders_link")}
          </Link>
        </div>
      </section>
    );
  }

  const enc = primaryStoreId ? encodeURIComponent(primaryStoreId) : "";
  const ordersHref = primaryStoreId
    ? buildStoreOrdersHref({ storeId: primaryStoreId, tab: "new" })
    : "/stores/owner/orders";
  const inquiriesHref = primaryStoreId
    ? `/stores/owner/inquiries?storeId=${enc}`
    : "/stores/owner/inquiries";
  const hubHref = primaryStoreId ? `/stores/owner?storeId=${enc}` : "/stores/owner";
  const productsHref = primaryStoreId
    ? `/stores/owner/products?storeId=${enc}`
    : "/stores/owner/products";

  return (
    <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <h2 className="sam-text-body font-semibold text-sam-fg">{t("mypage_comp_store_section_owner_title")}</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          href={ordersHref}
          className="rounded-ui-rect border border-amber-200 bg-amber-50 py-3 text-center sam-text-body-secondary font-semibold text-amber-950"
        >
          {t("mypage_comp_store_owner_new_orders")}
        </Link>
        <Link
          href={inquiriesHref}
          className="rounded-ui-rect border border-sam-border-soft bg-sam-surface-muted py-3 text-center sam-text-body-secondary font-medium text-sam-fg"
        >
          {t("mypage_comp_store_owner_inquiries")}
        </Link>
        <Link
          href={hubHref}
          className="rounded-ui-rect border border-sam-border-soft bg-sam-surface-muted py-3 text-center sam-text-body-secondary font-medium text-sam-fg"
        >
          {t("mypage_comp_store_owner_hub")}
        </Link>
        <Link
          href={productsHref}
          className="rounded-ui-rect border border-sam-border-soft bg-sam-surface-muted py-3 text-center sam-text-body-secondary font-medium text-sam-fg"
        >
          {t("mypage_comp_store_owner_products")}
        </Link>
        <Link
          href={
            primaryStoreId
              ? `/stores/owner/settlements?storeId=${encodeURIComponent(primaryStoreId)}`
              : "/stores/owner/settlements"
          }
          className="col-span-2 rounded-ui-rect border border-sam-border-soft bg-sam-surface-muted py-3 text-center sam-text-body-secondary font-medium text-sam-fg"
        >
          {t("mypage_comp_store_owner_settlements")}
        </Link>
      </div>
      <Link href="/my/store-orders" className="mt-3 block text-center sam-text-helper text-sam-muted underline">
        {t("mypage_comp_store_buyer_orders_link")}
      </Link>
    </section>
  );
}
