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
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import "@/lib/admin/status-labels/ads-status-labels";
import type { FeedAdProduct } from "@/lib/ads/feed-ad-products";

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
  const { safeT, language } = useI18n();
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

  const save = async (row: Row) => {
    const ko = !en;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: ko ? "배너 광고 상품을 저장할까요?" : "Save this banner ad product?",
      description: ko
        ? "기간·Point 가격은 새 신청·연장에만 적용됩니다."
        : "Duration and Point apply to new requests and renewals only.",
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
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        product?: FeedAdProduct;
        products?: FeedAdProduct[];
        error?: string;
      };
      if (!res.ok || !j.ok || !j.product) {
        setResult({ ok: false, code: j.error ?? "save_failed" });
        // 실패 시 화면 값을 서버 값으로 되돌린다.
        await load();
        return;
      }
      // Refetch authority — do not trust local draft alone.
      await load();
      setResult({ ok: true, message: en ? "Saved." : "저장했습니다." });
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
        {safeT("admin_feed_ad_products_title", {
          fallbackKo: "배너 광고 상품 설정",
          fallbackEn: "Banner ad products",
        })}
      </h1>
      <p className="sam-text-helper text-sam-muted">
        {safeT("admin_feed_ad_products_hint", {
          fallbackKo:
            "기간·Point 가격은 새 신청·연장에만 적용됩니다. 이미 접수된 신청 금액은 바뀌지 않습니다.",
          fallbackEn:
            "Duration and Point apply to new requests and renewals only. Existing request snapshots stay unchanged.",
        })}
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
        searchPlaceholder={en ? "Product name" : "상품 이름"}
        status={{
          value: lq.query.status,
          onChange: lq.setStatus,
          label: en ? "Active" : "활성",
          options: [
            { value: "active", label: en ? "Active" : "활성" },
            { value: "inactive", label: en ? "Inactive" : "비활성" },
          ],
        }}
      >
        <label className="flex flex-col gap-1 text-[12px] font-medium text-[var(--admin-console-muted)]">
          {en ? "Domain" : "영역"}
          <select
            className="h-10 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2.5 text-[16px] text-[var(--admin-console-fg)]"
            value={lq.query.extras.domain}
            onChange={(e) => lq.setExtra("domain", e.target.value)}
            name="domain"
          >
            <option value="">{en ? "All" : "전체"}</option>
            <option value="trade">{en ? "Trade" : "거래"}</option>
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
              <th className="px-3 py-2">{en ? "Product" : "상품"}</th>
              <th className="px-3 py-2">{en ? "Domain" : "영역"}</th>
              <th className="px-3 py-2">{en ? "Days" : "기간"}</th>
              <th className="px-3 py-2">Point</th>
              <th className="px-3 py-2">{en ? "Sort" : "정렬"}</th>
              <th className="px-3 py-2">{en ? "Active" : "활성"}</th>
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
