"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { MessageKey } from "@/lib/i18n/messages";
import { resolveAdminApiErrorMessage } from "@/lib/admin/admin-api-error-i18n";
import { parseAdminPlatformInquiryFocusRequestId } from "@/lib/admin/admin-inquiry-deeplink";
import { useAdminStorePointPendingCount } from "@/components/admin/store-points/AdminStorePointPendingProvider";

type Row = {
  id: string;
  inquiry_type: string;
  inquiry_kind: string;
  store_id: string | null;
  store_name: string;
  point_balance: number;
  from_user_id: string;
  subject: string;
  content: string;
  status: string;
  answer: string | null;
  created_at: string;
};

const TYPE_KEYS: Record<string, MessageKey> = {
  general: "admin_platform_inquiry_type_general",
  store_ops: "admin_platform_inquiry_type_store_ops",
  store_point: "admin_platform_inquiry_type_store_point",
  settlement: "admin_platform_inquiry_type_settlement",
  ad: "admin_platform_inquiry_type_ad",
};

const KIND_KEYS: Record<string, MessageKey> = {
  account_request: "admin_platform_inquiry_kind_account",
};

const STATUS_KEYS: Record<string, MessageKey> = {
  open: "admin_platform_inquiry_status_open",
  answered: "admin_platform_inquiry_status_answered",
  closed: "admin_platform_inquiry_status_closed",
};

type FilterType = "all" | "store_point";

function AdminPlatformInquiriesPageInner() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const focusRequestId = parseAdminPlatformInquiryFocusRequestId(searchParams);
  const { refresh: refreshAdminQ } = useAdminStorePointPendingCount();
  const [filter, setFilter] = useState<FilterType>("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filter === "store_point" ? "?inquiry_type=store_point" : "";
      const res = await fetch(`/api/admin/platform-inquiries${qs}`, { credentials: "include" });
      const json = await res.json();
      setRows(json?.inquiries ?? []);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!focusRequestId || loading) return;
    const el = document.getElementById(`admin-platform-inquiry-${focusRequestId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusRequestId, loading, rows]);

  const submitAnswer = async (id: string) => {
    const answer = answerDraft[id]?.trim();
    if (!answer) return;
    setBusyId(id);
    setErr("");
    try {
      const res = await fetch(`/api/admin/platform-inquiries/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer, status: "answered" }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setErr(resolveAdminApiErrorMessage(json.error, t, "admin_platform_inquiry_answer_failed"));
        return;
      }
      await load();
      void refreshAdminQ();
    } catch {
      setErr(t("common_network_error"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_page_platform_inquiries" />
      <p className="text-sm text-sam-muted">{t("admin_platform_inquiries_desc")}</p>

      <div className="flex gap-2">
        {(
          [
            ["all", "admin_platform_inquiries_filter_all"],
            ["store_point", "admin_platform_inquiries_filter_store_point"],
          ] as const
        ).map(([val, key]) => (
          <button
            key={val}
            type="button"
            className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors ${
              filter === val
                ? "bg-[#006241] text-white"
                : "border border-sam-border text-sam-fg"
            }`}
            onClick={() => setFilter(val)}
          >
            {t(key)}
          </button>
        ))}
      </div>

      {err ? (
        <p className="rounded-ui-rect bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">{t("admin_platform_inquiries_empty")}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <article
              key={r.id}
              id={`admin-platform-inquiry-${r.id}`}
              className={`rounded-ui-rect border bg-sam-surface p-4 shadow-sm ${
                focusRequestId === r.id
                  ? "border-[#006241] ring-2 ring-[#006241]/30"
                  : "border-sam-border"
              }`}
              data-admin-platform-inquiry-row={focusRequestId === r.id ? "focused" : "idle"}
            >
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-semibold text-sam-fg">
                  {TYPE_KEYS[r.inquiry_type] ? t(TYPE_KEYS[r.inquiry_type]) : t("common_content_unavailable")}
                  {KIND_KEYS[r.inquiry_kind] ? (
                    <span className="ml-2 rounded-full bg-[#006241]/10 px-2 py-0.5 text-xs text-[#006241]">
                      {t(KIND_KEYS[r.inquiry_kind])}
                    </span>
                  ) : null}
                </span>
                <span className="text-sam-muted">
                  {STATUS_KEYS[r.status] ? t(STATUS_KEYS[r.status]) : t("common_content_unavailable")}
                </span>
              </div>
              {r.store_name ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-xs text-sam-muted">{r.store_name}</p>
                  {r.store_id ? (
                    <Link
                      href={`/admin/finance?storeId=${encodeURIComponent(r.store_id)}`}
                      className="rounded-full border border-sam-border px-2 py-0.5 text-xs text-sam-fg"
                    >
                      {t("admin_platform_inquiry_go_store_finance")}
                    </Link>
                  ) : null}
                </div>
              ) : null}
              <p className="mt-2 font-medium text-sam-fg">{r.subject}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-sam-fg">{r.content}</p>
              {r.answer ? (
                <div className="mt-3 rounded-ui-rect bg-sam-app p-3 text-sm whitespace-pre-wrap">{r.answer}</div>
              ) : (
                <div className="mt-3 space-y-2">
                  <textarea
                    className="w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
                    rows={3}
                    placeholder={t("admin_platform_inquiry_answer_placeholder")}
                    value={answerDraft[r.id] ?? ""}
                    onChange={(e) =>
                      setAnswerDraft((d) => ({ ...d, [r.id]: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    className="rounded-ui-rect bg-[#006241] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    onClick={() => void submitAnswer(r.id)}
                  >
                    {t("admin_platform_inquiry_answer_submit")}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminPlatformInquiriesPage() {
  return (
    <Suspense fallback={null}>
      <AdminPlatformInquiriesPageInner />
    </Suspense>
  );
}
