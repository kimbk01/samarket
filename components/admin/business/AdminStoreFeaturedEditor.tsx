"use client";

/**
 * HS-07 — 매장 운영 상세 「추천 매장」 설정 (`stores.is_featured` + 기간 `featured_start_at`/`featured_end_at`).
 * 저장 = 기존 관리자 매장 PATCH `set_store_featured` (감사 기록·캐시 무효화는 서버 auditOk).
 * 확인 단계: 지정 = 노출 켜기와 같은 L2(사유), 해제 = L1.
 */
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { formatAdminManilaDate } from "@/lib/admin/metrics/manila-period";
import {
  isoToManilaDateInput,
  manilaDateInputToIso,
} from "@/lib/admin-business/admin-store-featured";

export type AdminStoreFeaturedState = {
  isFeatured: boolean;
  startAt: string | null;
  endAt: string | null;
};

export function AdminStoreFeaturedEditor({
  ko,
  storeName,
  featured,
  busy,
  onRunAction,
}: {
  ko: boolean;
  storeName: string;
  featured: AdminStoreFeaturedState;
  busy: boolean;
  onRunAction: (action: string, body: Record<string, unknown>) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [from, setFrom] = useState(() => isoToManilaDateInput(featured.startAt));
  const [to, setTo] = useState(() => isoToManilaDateInput(featured.endAt));
  useEffect(() => {
    setFrom(isoToManilaDateInput(featured.startAt));
    setTo(isoToManilaDateInput(featured.endAt));
  }, [featured.startAt, featured.endAt]);

  const periodLabel =
    featured.startAt || featured.endAt
      ? `${featured.startAt ? formatAdminManilaDate(featured.startAt) : t("admin_biz_any")} ~ ${
          featured.endAt ? formatAdminManilaDate(featured.endAt) : t("admin_biz_any")
        }`
      : t("admin_biz_no_period");

  const save = async (enable: boolean) => {
    const label = enable ? t("admin_biz_set_featured") : t("admin_biz_unset_featured");
    const confirmed = await confirmAdminAction({
      level: adminActionLevel(enable ? "exposeStart" : "exposeStop"),
      ko,
      title: `${storeName.trim() || "—"} · ${label}`,
      description: enable
        ? t("admin_biz_featured_period_confirm", {
            from: from || t("admin_biz_any_lower"),
            to: to || t("admin_biz_any_lower"),
          })
        : undefined,
      confirmLabel: label,
    });
    if (!confirmed.ok) return;
    await onRunAction("set_store_featured", {
      enabled: enable,
      ...(enable
        ? {
            featured_start_at: from ? manilaDateInputToIso(from, "start") : null,
            featured_end_at: to ? manilaDateInputToIso(to, "end") : null,
          }
        : {}),
      ...(confirmed.reason ? { reason: confirmed.reason } : {}),
    });
  };

  return (
    <div className="space-y-3" data-admin-store-featured-editor="1">
      <div className="flex flex-wrap items-center gap-2">
        <AdminToneBadge tone={featured.isFeatured ? "progress" : "neutral"}>
          {featured.isFeatured ? t("admin_biz_featured_2") : t("admin_biz_not_featured")}
        </AdminToneBadge>
        {featured.isFeatured ? <span className="sam-text-helper text-sam-muted">{periodLabel}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1 sam-text-helper text-sam-muted">
          {t("admin_biz_from")}
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-ui-rect border border-sam-border bg-sam-surface px-2 sam-text-body text-sam-fg"
          />
        </label>
        <label className="inline-flex items-center gap-1 sam-text-helper text-sam-muted">
          {t("admin_biz_to")}
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-ui-rect border border-sam-border bg-sam-surface px-2 sam-text-body text-sam-fg"
          />
        </label>
        <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={() => void save(true)}>
          {featured.isFeatured ? t("admin_biz_save_period") : t("admin_biz_set_featured")}
        </AdminActionButton>
        {featured.isFeatured ? (
          <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={() => void save(false)}>
            {t("admin_biz_unset_featured")}
          </AdminActionButton>
        ) : null}
      </div>
      <p className="sam-text-helper text-sam-muted">
        {t("admin_biz_featured_stores_become_candidates_for_the")}
      </p>
    </div>
  );
}
