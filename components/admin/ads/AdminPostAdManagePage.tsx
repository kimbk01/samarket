"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdStatusBadge } from "@/components/ads/AdStatusBadge";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { AdminPostAdRow, AdType } from "@/lib/ads/types";

const STATUS_FILTER_VALUES = [
  "",
  "pending_review",
  "active",
  "rejected",
  "expired",
  "cancelled",
] as const;

const STATUS_FILTER_KEYS: Record<(typeof STATUS_FILTER_VALUES)[number], MessageKey> = {
  "": "common_all",
  pending_review: "admin_ads_post_status_pending_review",
  active: "admin_ads_post_status_active",
  rejected: "admin_ads_post_status_rejected",
  expired: "admin_ads_post_status_expired",
  cancelled: "admin_ads_post_status_cancelled",
};

const AD_TYPE_KEYS = {
  top_fixed: "admin_ads_post_type_top_fixed",
  mid_insert: "admin_ads_post_type_mid_insert",
  highlight: "admin_ads_post_type_highlight",
} as const satisfies Record<AdType, MessageKey>;

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

export function AdminPostAdManagePage() {
  const { t, language } = useI18n();
  const dateLocale = dateLocaleTag(language);
  const [rows, setRows] = useState<AdminPostAdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ads", { cache: "no-store" });
      const j = (await res.json()) as { ads?: AdminPostAdRow[] };
      setRows(j.ads ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!statusFilter) return rows;
    return rows.filter((r) => r.applyStatus === statusFilter);
  }, [rows, statusFilter]);

  const counts = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((r) => r.applyStatus === "active").length,
      pending: rows.filter(
        (r) => r.applyStatus === "pending_review" || r.applyStatus === "pending_payment"
      ).length,
      rejected: rows.filter((r) => r.applyStatus === "rejected").length,
    }),
    [rows]
  );

  const summaryCards = [
    { key: "common_all" as const, value: counts.total, color: "text-sam-fg" },
    { key: "admin_ads_summary_active" as const, value: counts.active, color: "text-emerald-700" },
    {
      key: "admin_ads_summary_pending_review" as const,
      value: counts.pending,
      color: "text-blue-700",
    },
    { key: "admin_ads_summary_rejected" as const, value: counts.rejected, color: "text-red-600" },
  ];

  const doAction = async (
    adId: string,
    action: "approve" | "reject" | "cancel" | "expire",
    note?: string
  ) => {
    setBusyId(adId);
    setErr("");
    try {
      const res = await fetch(`/api/admin/ads/${adId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, adminNote: note }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? t("admin_ads_action_failed"));
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_page_post_ad_manage" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summaryCards.map(({ key, value, color }) => (
          <div
            key={key}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 text-center shadow-sm"
          >
            <p className={`sam-text-hero font-bold ${color}`}>{value}</p>
            <p className="sam-text-xxs text-sam-muted">{t(key)}</p>
          </div>
        ))}
      </div>

      {counts.pending > 0 && (
        <div className="flex items-center gap-2 rounded-ui-rect border border-blue-300 bg-blue-50 px-4 py-3 sam-text-body-secondary text-blue-900">
          <span className="sam-text-body-lg">⏳</span>
          <span>{t("admin_ads_pending_banner", { count: counts.pending })}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTER_VALUES.map((value) => (
          <button
            key={value || "all"}
            type="button"
            onClick={() => setStatusFilter(value)}
            className={`rounded-full px-3 py-1.5 sam-text-helper font-medium transition-colors ${
              statusFilter === value
                ? "bg-sam-ink text-white"
                : "border border-sam-border bg-sam-surface text-sam-muted hover:bg-sam-app"
            }`}
          >
            {t(STATUS_FILTER_KEYS[value])}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto rounded-full border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper text-sam-muted hover:bg-sam-app"
        >
          {t("admin_ads_refresh")}
        </button>
      </div>

      {err ? (
        <p className="rounded-ui-rect bg-red-50 px-3 py-2 sam-text-helper text-red-700">{err}</p>
      ) : null}

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
        <div className="border-b border-sam-border-soft px-4 py-3">
          <h2 className="sam-text-body font-semibold text-sam-fg">
            {t("admin_ads_list_heading")}{" "}
            <span className="sam-text-body-secondary font-normal text-sam-meta">
              {t("admin_ads_count_suffix", { count: filtered.length })}
            </span>
          </h2>
        </div>

        {loading ? (
          <p className="py-12 text-center sam-text-body-secondary text-sam-meta">
            {t("common_loading")}
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center sam-text-body-secondary text-sam-meta">
            {statusFilter ? t("admin_ads_empty_filtered") : t("admin_ads_empty_none")}
          </p>
        ) : (
          <div className="divide-y divide-sam-border-soft">
            {filtered.map((row) => {
              const busy = busyId === row.id;
              const note = noteInputs[row.id] ?? row.adminNote ?? "";
              const canApprove =
                row.applyStatus === "pending_review" || row.applyStatus === "pending_payment";
              const canExpire = row.applyStatus === "active";

              return (
                <div
                  key={row.id}
                  className={`px-4 py-4 ${canApprove ? "bg-blue-50/30" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <AdStatusBadge status={row.applyStatus} />
                        <span className="truncate sam-text-body font-semibold text-sam-fg">
                          {row.postTitle}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 sam-text-helper text-sam-muted">
                        <span>
                          {t("admin_ads_label_advertiser")}:{" "}
                          <strong className="text-sam-fg">{row.userNickname}</strong>
                        </span>
                        <span>
                          {t("admin_ads_label_board")}: {row.boardKey}
                        </span>
                        <span>{t(AD_TYPE_KEYS[row.adType])}</span>
                        <span className="font-semibold text-sky-700">
                          {row.pointCost.toLocaleString()}P
                        </span>
                        {row.startAt && row.endAt ? (
                          <span>
                            {new Date(row.startAt).toLocaleDateString(dateLocale)} ~{" "}
                            {new Date(row.endAt).toLocaleDateString(dateLocale)}
                          </span>
                        ) : null}
                        <span className="text-sam-meta">
                          {t("admin_ads_applied_line", {
                            date: new Date(row.createdAt).toLocaleString(dateLocale),
                          })}
                        </span>
                      </div>
                      <p className="mt-0.5 sam-text-helper text-sam-muted">
                        {t("admin_ads_product_line", { name: row.adProductName ?? "" })}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={note}
                      onChange={(e) =>
                        setNoteInputs((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      placeholder={t("admin_ads_admin_note_placeholder")}
                      className="w-48 rounded-ui-rect border border-sam-border px-2.5 py-1.5 sam-text-helper outline-none focus:border-sky-300"
                    />

                    {canApprove && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void doAction(row.id, "approve", note)}
                          className="rounded-ui-rect bg-emerald-600 px-3 py-1.5 sam-text-helper font-bold text-white disabled:opacity-50"
                        >
                          {busy ? t("common_processing") : t("admin_ads_action_approve")}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void doAction(row.id, "reject", note)}
                          className="rounded-ui-rect bg-red-500 px-3 py-1.5 sam-text-helper font-bold text-white disabled:opacity-50"
                        >
                          {t("admin_ads_action_reject")}
                        </button>
                      </>
                    )}
                    {canExpire && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void doAction(row.id, "expire", note)}
                        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper text-sam-fg disabled:opacity-50"
                      >
                        {t("admin_ads_action_force_end")}
                      </button>
                    )}
                    {row.applyStatus !== "cancelled" && row.applyStatus !== "expired" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void doAction(row.id, "cancel", note)}
                        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper text-sam-muted disabled:opacity-50"
                      >
                        {t("common_cancel")}
                      </button>
                    )}

                    <Link
                      href={`/admin/users/${row.userId}?tab=points`}
                      className="ml-auto rounded-ui-rect border border-sam-border px-2.5 py-1.5 sam-text-xxs text-sam-muted hover:text-sky-700"
                    >
                      {t("admin_ads_view_advertiser_points")}
                    </Link>
                  </div>

                  {row.adminNote && row.applyStatus === "rejected" && (
                    <p className="mt-2 rounded-ui-rect bg-red-50 px-2 py-1.5 sam-text-xxs text-red-700">
                      {t("admin_ads_reject_reason", { reason: row.adminNote })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
