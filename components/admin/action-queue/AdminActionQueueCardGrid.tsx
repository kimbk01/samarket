"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  ADMIN_ACTION_QUEUE_REGISTRY_BY_KEY,
  type AdminActionQueueCategoryResult,
} from "@/lib/admin/admin-action-queue-registry";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";

/**
 * Action Queue cards — rendered ONLY from registry + /api/admin/admin-bell `categories`.
 * Shared by CP Overview (#action-queue), /admin Action Center, /admin/order-notifications.
 *
 * Invariant: Σ cards with inTotal && status=ok == Bell total (same response).
 * - unavailable → "확인 불가" (never 0)
 * - forbidden / legacy archive / no listHref → not rendered
 * - owner workload → monitoring label, outside the total
 */
export function AdminActionQueueCardGrid({
  categories,
  loading = false,
  hideZero = false,
  hrefDecorator,
}: {
  categories: readonly AdminActionQueueCategoryResult[];
  loading?: boolean;
  /** Action-required strips show only non-zero / unavailable cards. */
  hideZero?: boolean;
  /** e.g. withAdminReturnTo(href, "/admin") */
  hrefDecorator?: (href: string) => string;
}) {
  const { safeT, language } = useI18n();
  const ko = language !== "en";

  const rows = categories
    .filter((c) => c.status !== "forbidden" && c.listHref)
    .filter((c) => ADMIN_ACTION_QUEUE_REGISTRY_BY_KEY.get(c.key)?.lifecycle === "active")
    .filter((c) => !hideZero || c.status === "unavailable" || (c.count ?? 0) > 0)
    .sort((a, b) => Number(b.inTotal) - Number(a.inTotal));

  const unavailableLabel = safeT("admin_queue_card_unavailable", {
    fallbackKo: "확인 불가",
    fallbackEn: "Unavailable",
  });
  const ownerLabel = safeT("admin_queue_card_owner_monitoring", {
    fallbackKo: "사장님 처리 · 합계 제외",
    fallbackEn: "Owner to handle · not in total",
  });

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="admin-action-queue-cards">
      {rows.map((c) => {
        const def = ADMIN_ACTION_QUEUE_REGISTRY_BY_KEY.get(c.key);
        if (!def || !c.listHref) return null;
        const href = hrefDecorator ? hrefDecorator(c.listHref) : c.listHref;
        const unavailable = c.status === "unavailable";
        return (
          <Link
            key={c.key}
            href={href}
            className="flex min-h-[7.5rem] flex-col justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 transition-colors hover:border-signature/40 hover:bg-sam-app"
            data-admin-queue-category={c.key}
            data-in-total={c.inTotal ? "1" : "0"}
            data-count={unavailable ? "unavailable" : String(c.count ?? 0)}
          >
            <div>
              <p className="sam-text-helper text-sam-muted">
                {ko ? def.domainKo : def.domainEn}
                {!c.inTotal ? ` · ${ownerLabel}` : ""}
              </p>
              <p className="mt-1 text-[14px] font-semibold text-sam-fg">{ko ? def.titleKo : def.titleEn}</p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-sam-primary">{ko ? def.ctaKo : def.ctaEn}</span>
              {loading ? (
                <span className="text-[12px] text-sam-muted">…</span>
              ) : unavailable ? (
                <span className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-2 py-0.5 text-[12px] font-bold text-sam-fg">
                  {unavailableLabel}
                </span>
              ) : (c.count ?? 0) > 0 ? (
                <span className="rounded-full bg-sam-primary px-2 py-0.5 text-[12px] font-bold text-sam-on-primary tabular-nums">
                  {formatAdminNumber(c.count)}
                </span>
              ) : (
                <span className="text-[12px] text-sam-muted">0</span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
