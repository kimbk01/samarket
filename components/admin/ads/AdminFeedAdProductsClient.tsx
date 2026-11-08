"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";
import { AdminStatusLabel } from "@/components/admin/ui/AdminStatusLabel";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminConflictReloadedCode } from "@/lib/admin/operator-ux/operator-labels";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import "@/lib/admin/status-labels/ads-status-labels";
import type { FeedAdProduct } from "@/lib/ads/feed-ad-products";
import { useAdminWriteGuard } from "@/components/admin/access/use-admin-route-access";

type Row = FeedAdProduct & {
  draftDuration: string;
  draftPoint: string;
  draftSort: string;
  draftActive: boolean;
};

/** 목록 조건 — API(GET /api/admin/feed-ad-products)가 전체 상품을 한 번에 주므로 화면에서 거른다. */
const PRODUCT_ACTIVE_FILTER = ["active", "inactive"] as const;
const PRODUCT_FILTER_EXTRAS = ["domain"] as const;

/**
 * Admin Feed Banner product CMS — duration / Point / active / sort.
 * Writer: PATCH /api/admin/feed-ad-products → feed_ad_products (DB SSOT).
 */
export function AdminFeedAdProductsClient() {
  const { safeT, language, t } = useI18n();
  const en = language === "en";
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(
    null
  );

  const load = useCallback(async () => {
    setErr("");
    setLoading(true);
    const res = await adminFetch("/api/admin/feed-ad-products", {
      credentials: "include",
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      products?: FeedAdProduct[];
      error?: string;
    };
    setLoading(false);
    if (!res.ok || !j.ok) {
      setErr(j.error ?? "load_failed");
      setRows([]);
      return;
    }
    setRows(
      (j.products ?? []).map((p) => ({
        ...p,
        draftDuration: String(p.durationDays),
        draftPoint: String(p.pointCost),
        draftSort: String(p.sortOrder),
        draftActive: p.active,
      }))
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const lq = useAdminListQuery<(typeof PRODUCT_FILTER_EXTRAS)[number]>({
    statuses: PRODUCT_ACTIVE_FILTER,
    extras: PRODUCT_FILTER_EXTRAS,
  });
  const visibleRows = useMemo(() => {
    const q = lq.query.q.trim().toLowerCase();
    return rows.filter((r) => {
      if (lq.query.status === "active" && !r.active) return false;
      if (lq.query.status === "inactive" && r.active) return false;
      if (lq.query.extras.domain && r.domain !== lq.query.extras.domain) return false;
      if (q && ![r.titleKo, r.titleEn, r.id].some((v) => String(v ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, lq.query]);

  /** 재감사 S-2 (H-4): 피드 배너 상품 저장 = ads 키 (서버 PATCH 와 같음) */
  const writeGuard = useAdminWriteGuard("/admin/feed-ad-products");
  const save = async (row: Row) => {
    if (!writeGuard.guard()) return;
    const ko = !en;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("pointPolicySave"),
      ko,
      title: t("admin_ads_save_banner_ad_product"),
      description: t("admin_ads_duration_point_apply_new_requests"),
      confirmLabel: adminCta("save", ko),
    });
    if (!confirmed.ok) return;
    setBusyId(row.id);
    setResult(null);
    try {
      const res = await adminFetch("/api/admin/feed-ad-products", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          durationDays: Number(row.draftDuration),
          pointCost: Number(row.draftPoint),
          sortOrder: Number(row.draftSort),
          isActive: row.draftActive,
          expectedUpdatedAt: row.updatedAt ?? "",
          reason: confirmed.reason ?? "",
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        product?: FeedAdProduct;
        products?: FeedAdProduct[];
        error?: string;
      };
      if (!res.ok || !j.ok || !j.product) {
        /** 다른 관리자가 먼저 저장(409) → 아래 load() 로 새 값을 다시 그리고 「다시 불러왔음」 안내 */
        setResult({ ok: false, code: adminConflictReloadedCode(j.error ?? "save_failed") });
        // 실패 시 화면 값을 서버 값으로 되돌린다.
        await load();
        return;
      }
      // Refetch authority — do not trust local draft alone.
      await load();
      setResult({ ok: true, message: t("admin_ads_saved") });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <AdminPageHeader
        titleKey="admin_menu_ads_feed_products"
        backHref="/admin/ad-applications"
      />
      <h1 className="sam-text-title font-semibold text-sam-fg">
        {safeT("admin_feed_ad_products_title")}
      </h1>
      <p className="sam-text-helper text-sam-muted">
        {safeT("admin_feed_ad_products_hint")}
      </p>
      <div className="flex justify-end">
        <AdminActionButton variant="secondary" size="sm" disabled={loading} onClick={() => void load()}>
          {adminCta("refresh", !en)}
        </AdminActionButton>
      </div>
      <AdminResultBanner ko={!en} result={result} onClose={() => setResult(null)} />
      <AdminFilterBar
        ko={!en}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        pending={loading}
        showPeriod={false}
        searchPlaceholder={t("admin_ads_product_name")}
        status={{
          value: lq.query.status,
          onChange: lq.setStatus,
          label: t("common_active"),
          options: [
            { value: "active", label: t("common_active") },
            { value: "inactive", label: t("admin_ads_inactive") },
          ],
        }}
      >
        <label className="flex flex-col gap-1 text-[12px] font-medium text-[var(--admin-console-muted)]">
          {t("admin_ads_domain")}
          <select
            className="h-10 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2.5 text-[16px] text-[var(--admin-console-fg)]"
            value={lq.query.extras.domain}
            onChange={(e) => lq.setExtra("domain", e.target.value)}
            name="domain"
          >
            <option value="">{t("common_all")}</option>
            <option value="trade">{t("admin_ads_trade")}</option>
            <option value="community">Community</option>
          </select>
        </label>
      </AdminFilterBar>
      {loading ? (
        <AdminLoadingState ko={!en} />
      ) : err ? (
        <AdminErrorState ko={!en} code={err} onRetry={() => void load()} />
      ) : visibleRows.length === 0 ? (
        <AdminEmptyState ko={!en} onReset={lq.isFiltered ? lq.reset : undefined} />
      ) : (
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
        <table className="w-full min-w-[640px] text-left sam-text-helper">
          <thead className="bg-sam-app text-sam-muted">
            <tr>
              <th className="px-3 py-2">{t("admin_ads_post_col_product")}</th>
              <th className="px-3 py-2">{t("admin_ads_domain")}</th>
              <th className="px-3 py-2">{t("admin_ads_days")}</th>
              <th className="px-3 py-2">Point</th>
              <th className="px-3 py-2">{t("common_sort")}</th>
              <th className="px-3 py-2">{t("common_active")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id} className="border-t border-sam-border">
                <td className="px-3 py-2">
                  <div className="font-medium text-sam-fg">{en ? row.titleEn : row.titleKo}</div>
                  <div className="text-sam-muted">{row.id}</div>
                </td>
                <td className="px-3 py-2">
                  <AdminStatusLabel namespace="ads.feedDomain" code={row.domain} ko={!en} />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={1}
                    max={90}
                    className="w-20 rounded-ui-rect border border-sam-border px-2 py-1"
                    value={row.draftDuration}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) =>
                          r.id === row.id ? { ...r, draftDuration: e.target.value } : r
                        )
                      )
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={1}
                    className="w-28 rounded-ui-rect border border-sam-border px-2 py-1"
                    value={row.draftPoint}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) =>
                          r.id === row.id ? { ...r, draftPoint: e.target.value } : r
                        )
                      )
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    className="w-20 rounded-ui-rect border border-sam-border px-2 py-1"
                    value={row.draftSort}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) =>
                          r.id === row.id ? { ...r, draftSort: e.target.value } : r
                        )
                      )
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={row.draftActive}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) =>
                          r.id === row.id ? { ...r, draftActive: e.target.checked } : r
                        )
                      )
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <AdminActionButton
                    variant="secondary"
                    size="sm"
                    disabled={busyId === row.id}
                    onClick={() => void save(row)}
                    data-testid={`admin-feed-ad-product-save-${row.id}`}
                  >
                    {adminCta("save", !en)}
                  </AdminActionButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
