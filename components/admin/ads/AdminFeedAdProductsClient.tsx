"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import type { FeedAdProduct } from "@/lib/ads/feed-ad-products";

type Row = FeedAdProduct & {
  draftDuration: string;
  draftPoint: string;
  draftSort: string;
  draftActive: boolean;
};

/**
 * Admin Feed Banner product CMS — duration / D-Point / active / sort.
 * Writer: PATCH /api/admin/feed-ad-products → feed_ad_products (DB SSOT).
 */
export function AdminFeedAdProductsClient() {
  const { safeT, language } = useI18n();
  const en = language === "en";
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr("");
    const res = await adminFetch("/api/admin/feed-ad-products", {
      credentials: "include",
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      products?: FeedAdProduct[];
      error?: string;
    };
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

  const save = async (row: Row) => {
    setBusyId(row.id);
    setErr("");
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
        setErr(j.error ?? "save_failed");
        return;
      }
      // Refetch authority — do not trust local draft alone.
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <AdminPageHeader
        title={safeT("admin_feed_ad_products_title", {
          fallbackKo: "배너 광고 상품 설정",
          fallbackEn: "Banner ad products",
        })}
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
            "기간·D-Point 가격은 새 신청·연장에만 적용됩니다. 이미 접수된 신청 금액은 바뀌지 않습니다.",
          fallbackEn:
            "Duration and D-Point apply to new requests and renewals only. Existing request snapshots stay unchanged.",
        })}
      </p>
      {err ? <p className="sam-text-helper text-sam-warning">{err}</p> : null}
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
        <table className="w-full min-w-[640px] text-left sam-text-helper">
          <thead className="bg-sam-app text-sam-muted">
            <tr>
              <th className="px-3 py-2">{en ? "Product" : "상품"}</th>
              <th className="px-3 py-2">{en ? "Domain" : "영역"}</th>
              <th className="px-3 py-2">{en ? "Days" : "기간"}</th>
              <th className="px-3 py-2">D-Point</th>
              <th className="px-3 py-2">{en ? "Sort" : "정렬"}</th>
              <th className="px-3 py-2">{en ? "Active" : "활성"}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-sam-border">
                <td className="px-3 py-2">
                  <div className="font-medium text-sam-fg">{en ? row.titleEn : row.titleKo}</div>
                  <div className="text-sam-muted">{row.id}</div>
                </td>
                <td className="px-3 py-2">{row.domain}</td>
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
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    className="rounded-ui-rect bg-signature px-3 py-1.5 font-medium text-white disabled:opacity-50"
                    onClick={() => void save(row)}
                    data-testid={`admin-feed-ad-product-save-${row.id}`}
                  >
                    {busyId === row.id
                      ? "…"
                      : safeT("common_save", { fallbackKo: "저장", fallbackEn: "Save" })}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="sam-text-helper text-sam-primary underline" onClick={() => void load()}>
        {en ? "Refresh from server" : "서버에서 다시 불러오기"}
      </button>
    </div>
  );
}
