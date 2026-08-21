"use client";

import Link from "next/link";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  ADMIN_STORE_APPROVAL_LABEL_KEYS,
  type AdminStoreReviewRow,
} from "@/components/admin/stores/admin-store-review-model";
import { sbStatusBadgeClass } from "@/components/admin/stores/admin-store-review-ui";
import type {
  BusinessCcDeliverySnapshot,
  BusinessCcFeeSnapshot,
  BusinessCcOwner,
  BusinessCcSalesPermission,
  BusinessCcStats,
} from "@/lib/admin-business/load-business-control-center-detail";
import {
  businessCcAuditHref,
  businessCcDeliveryDistanceHref,
  businessCcEntryReviewHref,
  businessCcFeePoliciesHref,
  businessCcOrdersByStoreHref,
  businessCcOwnerMemberHref,
  businessCcPointsHref,
  businessCcProductsHref,
  businessCcPublicStoreHref,
  businessCcReviewsHref,
  businessCcStoreOrdersHref,
  businessCcTaxonomyHref,
} from "@/lib/admin-business/business-control-center-links";

function CopyId({ value, labelKey }: { value: string; labelKey: MessageKey }) {
  const { t } = useI18n();
  if (!value) return <span className="text-sam-muted">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <code className="break-all font-mono text-[12px] text-sam-fg">{value}</code>
      <button
        type="button"
        className="rounded border border-sam-border px-1.5 py-0.5 sam-text-helper font-medium text-signature"
        onClick={() => {
          void navigator.clipboard.writeText(value).catch(() => {});
        }}
      >
        {t(labelKey)}
      </button>
    </span>
  );
}

function yn(t: (k: MessageKey) => string, v: boolean | null | undefined): string {
  if (v == null) return "—";
  return v ? t("admin_biz_yn_yes") : t("admin_biz_yn_no");
}

export function AdminBusinessCcSummary({
  store,
  owner,
  sales,
  stats,
  fee,
  delivery,
}: {
  store: AdminStoreReviewRow;
  owner: BusinessCcOwner;
  sales: BusinessCcSalesPermission;
  stats: BusinessCcStats;
  fee: BusinessCcFeeSnapshot;
  delivery: BusinessCcDeliverySnapshot;
}) {
  const { t } = useI18n();
  const statusKey = ADMIN_STORE_APPROVAL_LABEL_KEYS[store.approval_status];
  const statusLabel = statusKey ? t(statusKey) : store.approval_status;

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <h2 className="sam-text-section-title text-sam-fg">
            {(store.store_name ?? "").trim() || t("admin_stores_no_store_name")}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded border px-2 py-0.5 sam-text-helper font-medium ${sbStatusBadgeClass(
                store.approval_status
              )}`}
            >
              {statusLabel}
            </span>
            <span className="sam-text-helper text-sam-muted">
              {t("admin_biz_label_visible")}: {yn(t, store.is_visible)}
            </span>
            <span className="sam-text-helper text-sam-muted">
              {t("admin_biz_label_sales")}:{" "}
              {sales?.sales_status?.trim() || (sales?.allowed_to_sell ? "approved" : "—")}
            </span>
          </div>
          <p className="sam-text-body text-sam-fg">
            {t("admin_biz_label_owner")}: {owner.displayLabel}
            {owner.handle ? ` (${owner.handle})` : ""}
          </p>
          <p className="sam-text-helper text-sam-muted">
            {t("admin_biz_label_stats")}: {stats.productCount} / {stats.reviewCount}
            {" · "}
            {t("admin_biz_label_fee_scope")}: {fee.missing ? t("admin_biz_fee_missing") : fee.scope}
            {" · "}
            {t("admin_biz_label_delivery_flag")}: {yn(t, delivery.deliveryAvailable)}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 border-t border-sam-border-soft pt-4 sm:grid-cols-2">
        <div>
          <dt className="sam-text-helper text-sam-muted">{t("admin_biz_label_store_id")}</dt>
          <dd>
            <CopyId value={store.id} labelKey="admin_biz_cta_copy" />
          </dd>
        </div>
        <div>
          <dt className="sam-text-helper text-sam-muted">{t("admin_biz_label_owner_id")}</dt>
          <dd>
            <CopyId value={owner.ownerUserId} labelKey="admin_biz_cta_copy" />
          </dd>
        </div>
        <div>
          <dt className="sam-text-helper text-sam-muted">{t("admin_biz_label_slug")}</dt>
          <dd className="font-mono text-[12px]">{store.slug || "—"}</dd>
        </div>
        <div>
          <dt className="sam-text-helper text-sam-muted">{t("admin_biz_label_category_id")}</dt>
          <dd>
            <CopyId
              value={String(store.store_category_id ?? "").trim()}
              labelKey="admin_biz_cta_copy"
            />
          </dd>
        </div>
        <div>
          <dt className="sam-text-helper text-sam-muted">{t("admin_biz_label_topic_id")}</dt>
          <dd>
            <CopyId
              value={String(store.store_topic_id ?? "").trim()}
              labelKey="admin_biz_cta_copy"
            />
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function AdminBusinessCcDeliveryCard({
  delivery,
}: {
  delivery: BusinessCcDeliverySnapshot;
}) {
  const { t } = useI18n();
  const coords =
    delivery.lat != null && delivery.lng != null
      ? `${delivery.lat}, ${delivery.lng}`
      : "—";
  const overrideLabel = delivery.storeOverrideMode
    ? `${delivery.storeOverrideMode}${
        delivery.storeOverrideMaxKm != null ? ` / ${delivery.storeOverrideMaxKm}km` : ""
      }`
    : "—";

  return (
    <dl className="grid gap-2 sam-text-body sm:grid-cols-2">
      <div>
        <dt className="text-sam-muted">{t("admin_biz_label_delivery_flag")}</dt>
        <dd>{yn(t, delivery.deliveryAvailable)}</dd>
      </div>
      <div>
        <dt className="text-sam-muted">{t("admin_biz_label_pickup_flag")}</dt>
        <dd>{yn(t, delivery.pickupAvailable)}</dd>
      </div>
      <div>
        <dt className="text-sam-muted">{t("admin_biz_label_is_open")}</dt>
        <dd>{yn(t, delivery.isOpen)}</dd>
      </div>
      <div>
        <dt className="text-sam-muted">{t("admin_biz_label_coords")}</dt>
        <dd className="font-mono text-[12px]">{coords}</dd>
      </div>
      <div>
        <dt className="text-sam-muted">{t("admin_biz_label_distance_policy")}</dt>
        <dd>{yn(t, delivery.distancePolicyEnabled)}</dd>
      </div>
      <div>
        <dt className="text-sam-muted">{t("admin_biz_label_distance_applies")}</dt>
        <dd>{yn(t, delivery.applies)}</dd>
      </div>
      <div>
        <dt className="text-sam-muted">{t("admin_biz_label_max_km")}</dt>
        <dd>{delivery.maxKm == null ? "—" : delivery.maxKm}</dd>
      </div>
      <div>
        <dt className="text-sam-muted">{t("admin_biz_label_policy_source")}</dt>
        <dd>{delivery.policySource}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-sam-muted">{t("admin_biz_label_store_override")}</dt>
        <dd>{overrideLabel}</dd>
      </div>
      <p className="sm:col-span-2 sam-text-helper text-sam-muted">{t("admin_biz_hours_admin_write")}</p>
      <div className="sm:col-span-2">
        <Link href={businessCcDeliveryDistanceHref()} className="text-signature hover:underline">
          {t("admin_biz_cta_delivery_distance")}
        </Link>
      </div>
    </dl>
  );
}

export function AdminBusinessCcFeeCard({ fee }: { fee: BusinessCcFeeSnapshot }) {
  const { t } = useI18n();
  if (fee.missing) {
    return (
      <div className="space-y-2">
        <p className="sam-text-body text-amber-800">{t("admin_biz_fee_missing")}</p>
        <Link href={businessCcFeePoliciesHref()} className="text-signature hover:underline">
          {t("admin_biz_cta_fee")}
        </Link>
      </div>
    );
  }
  return (
    <dl className="grid gap-2 sam-text-body sm:grid-cols-2">
      <div className="sm:col-span-2 sam-text-helper text-sam-muted">
        {t("admin_biz_fee_precedence", { scope: fee.scope })}
      </div>
      <div>
        <dt className="text-sam-muted">{t("admin_biz_label_fee_scope")}</dt>
        <dd className="font-medium">{fee.scope}</dd>
      </div>
      <div>
        <dt className="text-sam-muted">{t("admin_biz_label_fee_policy")}</dt>
        <dd>{fee.policyName}</dd>
      </div>
      <div>
        <dt className="text-sam-muted">{t("admin_biz_label_fee_percent")}</dt>
        <dd>{fee.feePercent}</dd>
      </div>
      <div>
        <dt className="text-sam-muted">{t("admin_biz_label_fee_fixed")}</dt>
        <dd>{fee.fixedFee}</dd>
      </div>
      <div>
        <dt className="text-sam-muted">{t("admin_biz_label_fee_delivery")}</dt>
        <dd>
          {fee.deliveryFeeMode}
          {fee.deliveryFeeMode === "percent" ? ` (${fee.deliveryFeePercent}%)` : ""}
        </dd>
      </div>
      {fee.policyId ? (
        <div>
          <dt className="text-sam-muted">{t("admin_biz_label_policy_id")}</dt>
          <dd>
            <CopyId value={fee.policyId} labelKey="admin_biz_cta_copy" />
          </dd>
        </div>
      ) : null}
      <div className="sm:col-span-2">
        <Link href={businessCcFeePoliciesHref()} className="text-signature hover:underline">
          {t("admin_biz_cta_fee")}
        </Link>
      </div>
    </dl>
  );
}

const linkBtnClass =
  "inline-flex rounded border border-sam-border bg-sam-app px-3 py-2 sam-text-helper font-medium text-sam-fg hover:bg-sam-surface-muted";

export function AdminBusinessCcLinks({
  storeId,
  ownerUserId,
  storeName,
  slug,
  stats,
}: {
  storeId: string;
  ownerUserId: string;
  storeName: string;
  slug: string;
  stats: { productCount: number; reviewCount: number };
}) {
  const { t } = useI18n();
  const links: { href: string; labelKey: MessageKey; note?: string }[] = [
    {
      href: businessCcOrdersByStoreHref(storeId),
      labelKey: "admin_biz_cta_orders_by_store",
      note: "READY",
    },
    {
      href: businessCcStoreOrdersHref(storeId),
      labelKey: "admin_biz_cta_orders_all",
      note: "READY",
    },
    {
      href: businessCcProductsHref(storeId),
      labelKey: "admin_biz_cta_products",
      note: `READY · ${stats.productCount}`,
    },
    {
      href: businessCcReviewsHref(storeId),
      labelKey: "admin_biz_cta_reviews",
      note: `READY · ${stats.reviewCount}`,
    },
    {
      href: businessCcAuditHref(storeId),
      labelKey: "admin_biz_cta_audit",
      note: "READY",
    },
    {
      href: businessCcOwnerMemberHref(ownerUserId),
      labelKey: "admin_biz_cta_owner",
      note: "PARTIAL",
    },
    {
      href: businessCcFeePoliciesHref(),
      labelKey: "admin_biz_cta_fee",
      note: "PARTIAL",
    },
    {
      href: businessCcDeliveryDistanceHref(),
      labelKey: "admin_biz_cta_delivery_distance",
      note: "PARTIAL",
    },
    {
      href: businessCcEntryReviewHref(storeName || slug),
      labelKey: "admin_biz_cta_entry_review",
      note: "PARTIAL",
    },
    {
      href: businessCcTaxonomyHref(),
      labelKey: "admin_biz_cta_taxonomy",
      note: "PARTIAL",
    },
    {
      href: businessCcPointsHref(storeName || slug),
      labelKey: "admin_biz_cta_points",
      note: "PARTIAL",
    },
  ];
  if (slug.trim()) {
    links.push({ href: businessCcPublicStoreHref(slug), labelKey: "admin_biz_cta_public", note: "READY" });
  }

  return (
    <div className="space-y-3">
      <p className="sam-text-helper text-sam-muted">{t("admin_biz_hub_hint")}</p>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <Link
            key={`${l.href}:${l.labelKey}`}
            href={l.href}
            className={linkBtnClass}
            title={l.note}
          >
            {t(l.labelKey)}
            {l.note ? (
              <span className="ml-1 text-[10px] font-normal text-sam-muted">{l.note}</span>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
