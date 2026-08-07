"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type {
  PointFinancialFilter,
  PointFinancialHistoryItem,
} from "@/lib/points/point-financial-history";
import { resolveAdminApiErrorMessage } from "@/lib/admin/admin-api-error-i18n";

function formatSigned(signed: number): string {
  const abs = Math.abs(signed).toLocaleString();
  return signed < 0 ? `-${abs} P` : `+${abs} P`;
}

export function AdminPointLedgerPage() {
  const { t, language, safeT } = useI18n();
  const [items, setItems] = useState<(PointFinancialHistoryItem & { userNickname?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<PointFinancialFilter>("all");
  const [userId, setUserId] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(
    async (opts?: { append?: boolean; cursor?: string | null }) => {
      const append = Boolean(opts?.append);
      if (!append) setLoading(true);
      setErr("");
      try {
        const qs = new URLSearchParams({ filter, limit: "50" });
        if (userId.trim()) qs.set("userId", userId.trim());
        if (opts?.cursor) qs.set("cursor", opts.cursor);
        const res = await fetch(`/api/admin/points/ledger?${qs}`, { credentials: "include" });
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          history?: {
            items?: (PointFinancialHistoryItem & { userNickname?: string })[];
            hasMore?: boolean;
            nextCursor?: string | null;
          };
        };
        if (!res.ok || json.ok === false) {
          if (!append) setItems([]);
          setErr(resolveAdminApiErrorMessage(json.error, t, "admin_points_err_action_failed"));
          return;
        }
        const page = Array.isArray(json.history?.items) ? json.history!.items! : [];
        setItems((prev) => (append ? [...prev, ...page] : page));
        setHasMore(Boolean(json.history?.hasMore));
        setNextCursor(json.history?.nextCursor ?? null);
      } catch {
        if (!append) setItems([]);
        setErr(t("common_network_error"));
      } finally {
        setLoading(false);
      }
    },
    [filter, userId, t]
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="sam-text-page-title font-semibold text-sam-fg">{t("admin_points_ledger_page")}</h1>

      <div className="flex flex-wrap gap-2">
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder={safeT("point_fin_admin_user_filter", {
            fallbackKo: "회원 UUID (선택)",
            fallbackEn: "Member UUID (optional)",
          })}
          className="min-w-[240px] flex-1 rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
        >
          {safeT("point_fin_admin_apply_filter", { fallbackKo: "조회", fallbackEn: "Apply" })}
        </button>
        {(["all", "credit", "debit"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded-full px-3 py-1 sam-text-helper font-semibold ${
              filter === id ? "bg-signature text-white" : "bg-sam-surface-muted text-sam-muted"
            }`}
          >
            {id}
          </button>
        ))}
      </div>

      {err ? <p className="sam-text-helper text-red-600">{err}</p> : null}
      {loading ? (
        <p className="py-12 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>
      ) : items.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_points_ledger_empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[720px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium">{t("admin_points_th_datetime")}</th>
                <th className="px-3 py-2.5 text-left font-medium">{t("admin_points_th_user")}</th>
                <th className="px-3 py-2.5 text-left font-medium">{t("admin_points_th_type")}</th>
                <th className="px-3 py-2.5 text-left font-medium">사용처</th>
                <th className="px-3 py-2.5 text-right font-medium">{t("admin_points_th_amount")}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t("admin_points_th_balance")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => {
                const title = language === "en" ? e.fallbackTitleEn : e.fallbackTitleKo;
                const usage = e.promotion
                  ? e.promotion.targetTitle
                  : e.subtitle || e.description;
                return (
                  <tr key={e.ledgerId} className="border-b border-sam-border-soft hover:bg-sam-app">
                    <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                      {new Date(e.occurredAt).toLocaleString(language === "en" ? "en-US" : "ko-KR")}
                    </td>
                    <td className="px-3 py-2.5">
                      {e.userNickname || "—"}{" "}
                      <span className="sam-text-helper text-sam-meta">({e.userId.slice(0, 8)}…)</span>
                    </td>
                    <td className="px-3 py-2.5">{title}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-sam-muted">{usage}</td>
                    <td
                      className={`px-3 py-2.5 text-right font-medium ${
                        e.direction === "credit" ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {formatSigned(e.signedAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right">{e.balanceAfter.toLocaleString()}P</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {hasMore ? (
        <button
          type="button"
          className="w-full rounded-ui-rect border border-sam-border py-2"
          onClick={() => void load({ append: true, cursor: nextCursor })}
        >
          {safeT("point_fin_load_more", { fallbackKo: "더 보기", fallbackEn: "Load more" })}
        </button>
      ) : null}
    </div>
  );
}
