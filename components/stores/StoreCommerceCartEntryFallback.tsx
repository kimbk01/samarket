"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import { formatMoneyPhp } from "@/lib/utils/format";
import { sortedNonemptyCommerceBuckets } from "@/lib/stores/store-commerce-cart-nav";

export function StoreCommerceCartEntryFallback({
  hint,
  onRetry,
}: {
  hint: "network" | "missing" | "api";
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  const cart = useStoreCommerceCartOptional();
  const buckets =
    cart?.hydrated ? sortedNonemptyCommerceBuckets(cart.listCartBuckets()) : [];

  const title =
    hint === "network"
      ? t("store_cart_entry_title_network")
      : t("store_cart_entry_title_not_found");

  const sub =
    hint === "network"
      ? t("store_cart_entry_sub_network")
      : hint === "api"
        ? t("store_cart_entry_sub_api")
        : t("store_cart_entry_sub_gone");

  return (
    <div className="min-h-[50vh] bg-sam-app px-4 py-10">
      <p className="text-center sam-text-body font-semibold text-sam-fg">{title}</p>
      <p className="mt-2 text-center text-sm text-sam-muted">{sub}</p>
      {hint === "network" && onRetry ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 text-sm font-medium text-sam-fg"
          >
            {t("common_retry")}
          </button>
        </div>
      ) : null}
      {buckets.length > 0 ? (
        <div className="mx-auto mt-8 max-w-md rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-3 sam-text-body-secondary text-amber-950">
          <p className="font-medium">{t("store_cart_saved_hint")}</p>
          <ul className="mt-3 space-y-2">
            {buckets.map((b) => (
              <li key={b.storeId} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {b.storeName} {t("store_cart_items_kind", { count: b.itemCount })} · {formatMoneyPhp(b.subtotalPhp)}
                </span>
                <Link
                  href={`/stores/${encodeURIComponent(b.storeSlug)}/cart`}
                  className="shrink-0 font-semibold text-signature underline"
                >
                  {t("store_cart_open_cart")}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-8 text-center">
        <Link href="/stores" className="text-sm font-medium text-signature">
          {t("store_back_to_store_list")}
        </Link>
      </div>
    </div>
  );
}
