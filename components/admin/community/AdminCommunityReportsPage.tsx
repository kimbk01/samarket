"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import type { CommunityReportAdminRow } from "@/lib/community-feed/admin-community-reports";

const FEED_REPORT_ACTION_STATUS_KEYS = {
  reviewing: "admin_report_status_reviewing",
  resolved: "admin_report_status_resolved",
  dismissed: "admin_feed_reports_status_dismissed",
} as const satisfies Record<"reviewing" | "resolved" | "dismissed", MessageKey>;

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

export function AdminCommunityReportsPage({
  initialRows,
  highlightId = "",
}: {
  initialRows: CommunityReportAdminRow[];
  highlightId?: string;
}) {
  const router = useRouter();
  const { t: tr, language } = useI18n();
  const dateLocale = dateLocaleTag(language);
  const dash = tr("admin_users_empty_placeholder");
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [patchErr, setPatchErr] = useState("");
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  useEffect(() => {
    const id = highlightId.trim();
    if (!id) return;
    const el = rowRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("bg-amber-50");
      const timeoutId = window.setTimeout(() => el.classList.remove("bg-amber-50"), 2500);
      return () => window.clearTimeout(timeoutId);
    }
  }, [highlightId, rows]);

  const patch = async (id: string, status: string) => {
    setBusyId(id);
    setPatchErr("");
    try {
      const res = await fetch(`/api/admin/community-reports/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
        router.refresh();
      } else {
        setPatchErr(j.error ?? tr("admin_feed_reports_patch_fail", { status: res.status }));
      }
    } catch {
      setPatchErr(tr("admin_feed_reports_network_err"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_feed_reports_page_title" backHref="/admin/community/topics" />
      <AdminCard titleKey="admin_feed_reports_card_title">
        <p className="mb-3 sam-text-body-secondary text-sam-muted">{tr("admin_feed_reports_intro")}</p>
        <p className="mb-3 sam-text-body-secondary text-sam-muted">{tr("admin_feed_reports_comment_hold_note")}</p>
        {patchErr ? (
          <p className="mb-2 rounded bg-red-50 px-3 py-2 sam-text-helper text-red-700">{patchErr}</p>
        ) : null}
        {rows.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">{tr("admin_feed_reports_empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left sam-text-helper">
              <thead>
                <tr className="border-b border-sam-border text-sam-muted">
                  <th className="py-2 pr-2 font-medium">{tr("admin_feed_reports_col_time")}</th>
                  <th className="py-2 pr-2 font-medium">{tr("admin_feed_reports_col_target")}</th>
                  <th className="py-2 pr-2 font-medium">{tr("admin_feed_reports_col_post")}</th>
                  <th className="py-2 pr-2 font-medium">{tr("admin_feed_reports_col_reason")}</th>
                  <th className="py-2 pr-2 font-medium">{tr("admin_feed_reports_col_status")}</th>
                  <th className="py-2 font-medium">{tr("admin_feed_reports_col_actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    ref={(el) => {
                      rowRefs.current[r.id] = el;
                    }}
                    className="border-b border-sam-border-soft align-top transition-colors duration-500"
                  >
                    <td className="py-2 pr-2 whitespace-nowrap text-sam-muted">
                      {r.created_at ? new Date(r.created_at).toLocaleString(dateLocale) : dash}
                    </td>
                    <td className="py-2 pr-2 font-mono sam-text-xxs">
                      {r.target_type}
                      <br />
                      <span className="text-sam-meta">{r.target_id.slice(0, 8)}…</span>
                    </td>
                    <td className="py-2 pr-2 max-w-[200px]">
                      {r.target_type === "post" && r.post_title ? (
                        <Link
                          href={`/philife/${r.target_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sam-primary hover:text-sam-primary-hover hover:underline"
                        >
                          {r.post_title}
                        </Link>
                      ) : (
                        <span className="text-sam-meta">{dash}</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-sam-fg">
                      <span className="font-medium text-sam-muted">{r.reason_type}</span>
                      {r.reason_text ? <p className="mt-0.5 line-clamp-2 sam-text-xxs">{r.reason_text}</p> : null}
                    </td>
                    <td className="py-2 pr-2">{r.status}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {(["reviewing", "resolved", "dismissed"] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={busyId === r.id || r.status === s}
                            onClick={() => void patch(r.id, s)}
                            className="rounded border border-sam-border px-2 py-0.5 sam-text-xxs hover:bg-sam-app disabled:opacity-40"
                          >
                            {tr(FEED_REPORT_ACTION_STATUS_KEYS[s])}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
