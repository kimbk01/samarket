"use client";

/**
 * 신청 관리 hub — aggregated read model from ads-control-plane.
 * Mutations stay on domain writer queues (detail href). No unified_* tables.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdsActionItem } from "@/lib/admin/ads-control-plane/types";

type Filters = {
  domain: string;
  product: string;
  q: string;
};

const DEFAULT: Filters = { domain: "", product: "", q: "" };

export function AdminAdApplicationsUnifiedInbox() {
  const { language } = useI18n();
  const en = language === "en";
  const [rows, setRows] = useState<AdsActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filters, setFilters] = useState<Filters>(DEFAULT);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/ads-control-plane", { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        plane?: { applications?: AdsActionItem[] };
        error?: string;
      };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "load_failed");
        setRows([]);
        return;
      }
      setRows(Array.isArray(j.plane?.applications) ? j.plane!.applications! : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.domain && r.domain !== filters.domain) return false;
      if (filters.product && r.product !== filters.product) return false;
      if (!q) return true;
      const hay = `${r.id} ${r.applicantLabel} ${r.product} ${r.placementHint ?? ""} ${r.status}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, filters]);

  const domains = useMemo(
    () => Array.from(new Set(rows.map((r) => r.domain))).sort(),
    [rows]
  );
  const products = useMemo(
    () => Array.from(new Set(rows.map((r) => r.product))).sort(),
    [rows]
  );

  return (
    <section
      className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4"
      data-admin-ads-applications-unified="1"
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[12px] text-sam-muted">
          Domain
          <select
            className="mt-1 block min-w-[8rem] rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px]"
            value={filters.domain}
            onChange={(e) => setFilters((f) => ({ ...f, domain: e.target.value }))}
          >
            <option value="">{en ? "All" : "전체"}</option>
            {domains.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] text-sam-muted">
          {en ? "Product" : "상품"}
          <select
            className="mt-1 block min-w-[8rem] rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px]"
            value={filters.product}
            onChange={(e) => setFilters((f) => ({ ...f, product: e.target.value }))}
          >
            <option value="">{en ? "All" : "전체"}</option>
            {products.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[12rem] flex-1 text-[12px] text-sam-muted">
          {en ? "Search" : "검색"}
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px]"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder={en ? "ID / applicant / placement" : "신청번호 / 신청자 / 위치"}
          />
        </label>
        <button
          type="button"
          className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-[13px] font-medium"
          onClick={() => void load()}
        >
          {en ? "Refresh" : "새로고침"}
        </button>
      </div>

      {err ? <p className="text-[13px] text-red-600">{err}</p> : null}
      {loading ? (
        <p className="py-8 text-center text-[13px] text-sam-muted">…</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-sam-muted">
          {en ? "No actionable applications." : "처리할 신청이 없습니다."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="border-b border-sam-border text-[11px] uppercase tracking-wide text-sam-muted">
              <tr>
                <th className="py-2 pr-2 font-semibold">{en ? "App #" : "신청번호"}</th>
                <th className="py-2 pr-2 font-semibold">Domain</th>
                <th className="py-2 pr-2 font-semibold">{en ? "Product" : "상품"}</th>
                <th className="py-2 pr-2 font-semibold">{en ? "Target" : "대상"}</th>
                <th className="py-2 pr-2 font-semibold">{en ? "Applicant" : "신청자"}</th>
                <th className="py-2 pr-2 font-semibold">{en ? "Status" : "상태"}</th>
                <th className="py-2 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-sam-border-soft">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-2 font-mono text-[11px] tabular-nums">{r.id}</td>
                  <td className="py-2 pr-2">{r.domain}</td>
                  <td className="py-2 pr-2">{r.product}</td>
                  <td className="py-2 pr-2">{r.placementHint ?? "—"}</td>
                  <td className="py-2 pr-2">{r.applicantLabel}</td>
                  <td className="py-2 pr-2">{r.status}</td>
                  <td className="py-2 text-right">
                    <Link
                      href={r.href}
                      className="font-semibold text-signature underline-offset-2 hover:underline"
                    >
                      {en ? "Detail" : "상세"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
