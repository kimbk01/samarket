"use client";

/**
 * Owner ops surface — pending+refund+cancel / inquiry.
 * Deep link: orders → ops_attention (not forced tab=new); inquiries → inquiries page.
 * Compact modal always splits order vs inquiry (never merge into one wrong destination).
 */
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useOwnerHubBadgeBreakdownWhenEnabled } from "@/lib/chats/use-owner-hub-badge-total";
import { useOwnerLitePreferredStoreRow } from "@/lib/stores/use-owner-lite-store";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { resolveOwnerLiteStoreShortcuts } from "@/lib/delivery/owner/owner-lite-store-shortcuts";

type Props = {
  onNavigate?: () => void;
  className?: string;
  showSectionTitle?: boolean;
  /** Compact rows for bell modal / store tab */
  compact?: boolean;
  /** Show OwnerLite primary/secondary shortcuts under ops rows */
  showShortcuts?: boolean;
};

function DangerBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-sam-danger px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function OwnerBellOperationSummary({
  onNavigate,
  className = "",
  showSectionTitle = false,
  compact = false,
  showShortcuts = false,
}: Props) {
  const { t } = useI18n();
  const ownerStore = useOwnerLitePreferredStoreRow();
  const breakdown = useOwnerHubBadgeBreakdownWhenEnabled(ownerStore != null);

  if (!ownerStore) return null;

  const orderAttention = Math.max(0, Math.floor(Number(breakdown.orderAttention) || 0));
  const inquiryAttention = Math.max(0, Math.floor(Number(breakdown.inquiryAttention) || 0));
  if (orderAttention <= 0 && inquiryAttention <= 0 && !showShortcuts) return null;

  const storeId = ownerStore.id;
  /** Always land on action-required orders surface (auto-picks new/cancelled tab). */
  const orderHref = buildStoreOrdersHref({
    storeId,
    freshList: true,
    opsAttention: true,
  });
  const inquiryHref = `/stores/owner/inquiries?storeId=${encodeURIComponent(storeId)}`;
  const { primary, secondary } = resolveOwnerLiteStoreShortcuts(ownerStore, breakdown);

  const rowClass = compact
    ? "flex min-h-12 w-full items-center gap-3 rounded-2xl bg-sam-surface-muted/80 px-3 py-2.5 text-left transition active:scale-[0.99] active:bg-sam-muted/20"
    : "flex min-h-11 w-full items-center gap-2 rounded-ui-rect px-2.5 py-2 text-left transition hover:bg-sam-muted/10 active:scale-[0.99] active:bg-sam-muted/15";

  return (
    <section className={`min-w-0 ${className}`} aria-label={t("notif_store_ops_section")}>
      {showSectionTitle ? (
        <h2 className="mb-1.5 px-0.5 text-[12px] font-semibold text-sam-muted">
          {t("notif_store_ops_section")}
        </h2>
      ) : null}
      <ul className={`min-w-0 ${compact ? "space-y-1.5" : "space-y-1"}`}>
        {orderAttention > 0 ? (
          <li>
            <Link href={orderHref} onClick={onNavigate} className={rowClass}>
              {compact ? (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sam-danger/15 text-[13px] font-bold text-sam-danger">
                  {t("notif_store_ops_chip")}
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center rounded-md bg-sam-danger/12 px-1.5 py-0.5 text-[10px] font-semibold text-sam-danger">
                  {t("notif_store_ops_chip")}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate font-semibold text-sam-fg ${
                    compact ? "text-[14px]" : "text-[13px]"
                  }`}
                >
                  {t("store_lite_order_manage")}
                </span>
                <span className="block truncate text-[12px] text-sam-muted">
                  {t("notif_store_ops_orders_n", { n: orderAttention })}
                </span>
              </span>
              <DangerBadge n={orderAttention} />
            </Link>
          </li>
        ) : null}
        {inquiryAttention > 0 ? (
          <li>
            <Link href={inquiryHref} onClick={onNavigate} className={rowClass}>
              {compact ? (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sam-danger/15 text-[13px] font-bold text-sam-danger">
                  {t("notif_store_ops_chip")}
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center rounded-md bg-sam-danger/12 px-1.5 py-0.5 text-[10px] font-semibold text-sam-danger">
                  {t("notif_store_ops_chip")}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate font-semibold text-sam-fg ${
                    compact ? "text-[14px]" : "text-[13px]"
                  }`}
                >
                  {t("store_lite_received_inquiries")}
                </span>
                <span className="block truncate text-[12px] text-sam-muted">
                  {t("notif_store_ops_inquiries_n", { n: inquiryAttention })}
                </span>
              </span>
              <DangerBadge n={inquiryAttention} />
            </Link>
          </li>
        ) : null}
        {showShortcuts ? (
          <>
            <li>
              <Link href={primary.href} onClick={onNavigate} className={rowClass}>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-sam-fg">
                  {t(primary.labelKey)}
                </span>
                <DangerBadge n={primary.badge} />
              </Link>
            </li>
            <li>
              <Link href={secondary.href} onClick={onNavigate} className={rowClass}>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-sam-fg">
                  {t(secondary.labelKey)}
                </span>
                <DangerBadge n={secondary.badge} />
              </Link>
            </li>
            <li>
              <Link
                href={`/stores/owner?storeId=${encodeURIComponent(storeId)}`}
                onClick={onNavigate}
                className={rowClass}
              >
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-sam-fg">
                  {t("notif_store_ops_open_hub")}
                </span>
              </Link>
            </li>
          </>
        ) : null}
      </ul>
    </section>
  );
}

export function hasOwnerBellOperationRows(input: {
  hasOwnerStore: boolean;
  orderAttention: number;
  inquiryAttention: number;
}): boolean {
  if (!input.hasOwnerStore) return false;
  return (
    Math.max(0, Math.floor(Number(input.orderAttention) || 0)) > 0 ||
    Math.max(0, Math.floor(Number(input.inquiryAttention) || 0)) > 0
  );
}
