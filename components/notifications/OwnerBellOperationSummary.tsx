"use client";

/**
 * O_bell Surface rows — Product Bible: Bell Modal / History = [N] + [O_bell].
 * Source = OwnerHubBadgeBreakdown (hub attention). Does NOT invent digit.
 * Completion = owner admin accept/process — not Member A read.
 */
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useOwnerHubBadgeBreakdownWhenEnabled } from "@/lib/chats/use-owner-hub-badge-total";
import { useOwnerLitePreferredStoreRow } from "@/lib/stores/use-owner-lite-store";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";

type Props = {
  /** Close bell modal before navigate */
  onNavigate?: () => void;
  className?: string;
  /** Section heading — History page */
  showSectionTitle?: boolean;
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
}: Props) {
  const { t } = useI18n();
  const ownerStore = useOwnerLitePreferredStoreRow();
  const breakdown = useOwnerHubBadgeBreakdownWhenEnabled(ownerStore != null);

  if (!ownerStore) return null;

  const orderAttention = Math.max(0, Math.floor(Number(breakdown.orderAttention) || 0));
  const inquiryAttention = Math.max(0, Math.floor(Number(breakdown.inquiryAttention) || 0));
  if (orderAttention <= 0 && inquiryAttention <= 0) return null;

  const storeId = ownerStore.id;
  const orderHref = buildStoreOrdersHref({ storeId, tab: "new", freshList: true });
  const inquiryHref = `/stores/owner/inquiries?storeId=${encodeURIComponent(storeId)}`;

  const rowClass =
    "flex min-h-11 w-full items-center gap-2 rounded-ui-rect px-2.5 py-2 text-left transition hover:bg-sam-muted/10 active:scale-[0.99] active:bg-sam-muted/15";

  return (
    <section
      className={`min-w-0 ${className}`}
      aria-label={t("notif_store_ops_section")}
    >
      {showSectionTitle ? (
        <h2 className="mb-1.5 px-0.5 text-[12px] font-semibold text-sam-muted">
          {t("notif_store_ops_section")}
        </h2>
      ) : null}
      <ul className="min-w-0 space-y-1">
        {orderAttention > 0 ? (
          <li>
            <Link href={orderHref} onClick={onNavigate} className={rowClass}>
              <span className="inline-flex shrink-0 items-center rounded-md bg-sam-danger/12 px-1.5 py-0.5 text-[10px] font-semibold text-sam-danger">
                {t("notif_store_ops_chip")}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-sam-fg">
                {t("store_lite_order_manage")}
                <span className="ml-1 font-medium text-sam-muted">
                  {t("notif_store_ops_pending_n", { n: orderAttention })}
                </span>
              </span>
              <DangerBadge n={orderAttention} />
            </Link>
          </li>
        ) : null}
        {inquiryAttention > 0 ? (
          <li>
            <Link href={inquiryHref} onClick={onNavigate} className={rowClass}>
              <span className="inline-flex shrink-0 items-center rounded-md bg-sam-danger/12 px-1.5 py-0.5 text-[10px] font-semibold text-sam-danger">
                {t("notif_store_ops_chip")}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-sam-fg">
                {t("store_lite_received_inquiries")}
                <span className="ml-1 font-medium text-sam-muted">
                  {t("notif_store_ops_pending_n", { n: inquiryAttention })}
                </span>
              </span>
              <DangerBadge n={inquiryAttention} />
            </Link>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

/** Whether O_bell rows would render for current hub snapshot (tests / empty gating). */
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
