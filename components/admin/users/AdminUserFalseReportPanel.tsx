"use client";

/**
 * 허위·악의 신고 판정 — CREW REP S4 (설계 §4.4-2).
 * 이 회원이 신고자인 「반려·기각」 신고 목록. 운영자가 허위·악의로 판정하면 신고자 매너 −2, 판정 취소 가능.
 * API: /api/admin/users/:id/false-reports
 */
import { useCallback, useEffect, useState } from "react";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

type Item = {
  reportKind: "trade" | "community" | "chat" | "moim";
  reportId: string;
  reason: string | null;
  targetType: string | null;
  decidedAt: string | null;
  falseReportEventId: string | null;
};

const KIND_KEY = {
  trade: "admin_users_false_report_kind_trade",
  community: "admin_users_false_report_kind_community",
  chat: "admin_users_false_report_kind_chat",
  moim: "admin_users_false_report_kind_moim",
} as const;

export function AdminUserFalseReportPanel({
  userId,
  readOnly = false,
  onChanged,
}: {
  userId: string;
  readOnly?: boolean;
  onChanged?: () => void;
}) {
  const { t, language } = useI18n();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/false-reports`, { credentials: "include" });
      const data = (await res.json()) as { ok?: boolean; items?: Item[] };
      if (!res.ok || !data.ok) {
        setLoadError(true);
        setItems([]);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = useCallback(
    async (item: Item) => {
      const revoke = Boolean(item.falseReportEventId);
      const confirmed = await confirmAdminAction({
        level: adminActionLevel("sanction"),
        ko: language !== "en",
        title: t(revoke ? "admin_users_false_report_revoke" : "admin_users_false_report_decide"),
        description: t(revoke ? "admin_users_false_report_revoke_desc" : "admin_users_false_report_decide_desc"),
        confirmLabel: t(revoke ? "admin_users_false_report_revoke" : "admin_users_false_report_decide"),
        reasonPlaceholder: t("admin_users_false_report_reason"),
      });
      if (!confirmed.ok) return;
      const reason = confirmed.reason?.trim() ?? "";
      if (!reason) return;
      setBusyId(item.reportId);
      try {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/false-reports`, {
          method: revoke ? "DELETE" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            revoke
              ? { eventId: item.falseReportEventId, reason }
              : { reportKind: item.reportKind, reportId: item.reportId, reason }
          ),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          await dibayAlert({ title: data.error ?? t("admin_users_action_failed") });
          return;
        }
        await load();
        onChanged?.();
      } catch {
        await dibayAlert({ title: t("admin_users_action_failed") });
      } finally {
        setBusyId(null);
      }
    },
    [language, load, onChanged, t, userId]
  );

  return (
    <div data-testid="admin-false-report-panel">
      <p className="mb-1 text-xs font-semibold text-sam-fg">{t("admin_users_false_report_title")}</p>
      <p className="mb-2 text-[12px] leading-snug text-sam-meta">{t("admin_users_false_report_hint")}</p>
      {loading ? (
        <p className="text-sm text-sam-muted">{t("admin_dashboard_loading")}</p>
      ) : loadError ? (
        <p className="text-sm text-sam-danger">{t("admin_users_false_report_load_error")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-sam-meta">{t("admin_users_false_report_empty")}</p>
      ) : (
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {items.map((it) => (
            <li
              key={`${it.reportKind}:${it.reportId}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-sam-border bg-white px-3 py-2 text-xs text-sam-fg"
            >
              <div className="min-w-0">
                <p className="font-semibold">
                  {t(KIND_KEY[it.reportKind])}
                  {it.targetType ? ` · ${it.targetType}` : ""}
                  {it.reason ? ` · ${it.reason}` : ""}
                </p>
                <p className="mt-0.5 text-sam-muted">
                  {it.decidedAt ? formatAdminManilaDateTime(it.decidedAt) : ""}
                  {it.falseReportEventId ? ` · ${t("admin_users_false_report_marked")}` : ""}
                </p>
              </div>
              {!readOnly ? (
                <AdminActionButton
                  variant="secondary"
                  className="shrink-0"
                  disabled={busyId === it.reportId}
                  onClick={() => void decide(it)}
                >
                  {t(it.falseReportEventId ? "admin_users_false_report_revoke" : "admin_users_false_report_decide")}
                </AdminActionButton>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
