"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type {
  PointFinancialFilter,
  PointFinancialHistoryItem,
} from "@/lib/points/point-financial-history";
import { AdminPointAdjustPanel } from "@/components/admin/points/AdminPointAdjustPanel";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminTechId } from "@/components/admin/ui/AdminTechId";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";

function formatSigned(signed: number): string {
  const abs = formatAdminNumber(Math.abs(signed));
  return signed < 0 ? `-${abs} P` : `+${abs} P`;
}

const LEDGER_FILTER_LABEL: Record<PointFinancialFilter, { ko: string; en: string }> = {
  all: { ko: "전체", en: "All" },
  credit: { ko: "적립", en: "Credit" },
  debit: { ko: "차감", en: "Debit" },
};

export function AdminPointLedgerPage() {
  const { t, language, safeT } = useI18n();
  const ko = language !== "en";
  const action = useAdminRouteAction("/admin/points/ledger");
  const [items, setItems] = useState<(PointFinancialHistoryItem & { userNickname?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ code: string; httpStatus?: number } | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PointFinancialFilter>("all");
  const [userId, setUserId] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(
    async (opts?: { append?: boolean; cursor?: string | null }) => {
      const append = Boolean(opts?.append);
      if (!append) setLoading(true);
      setLoadError(null);
      setMoreError(null);
      try {
        const qs = new URLSearchParams({ filter, limit: "50" });
        if (userId.trim()) qs.set("userId", userId.trim());
        if (opts?.cursor) qs.set("cursor", opts.cursor);
        const res = await fetch(`/api/admin/points/ledger?${qs}`, { credentials: "include" });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          history?: {
            items?: (PointFinancialHistoryItem & { userNickname?: string })[];
            hasMore?: boolean;
            nextCursor?: string | null;
          };
        };
        if (!res.ok || json.ok === false) {
          if (append) {
            setMoreError(adminOperatorErrorMessage(json.error ?? "load_failed", ko));
          } else {
            setItems([]);
            setLoadError({ code: json.error ?? "load_failed", httpStatus: res.status });
          }
          return;
        }
        const page = Array.isArray(json.history?.items) ? json.history!.items! : [];
        setItems((prev) => (append ? [...prev, ...page] : page));
        setHasMore(Boolean(json.history?.hasMore));
        setNextCursor(json.history?.nextCursor ?? null);
      } catch {
        if (append) {
          setMoreError(adminOperatorErrorMessage("network_error", ko));
        } else {
          setItems([]);
          setLoadError({ code: "network_error" });
        }
      } finally {
        setLoading(false);
      }
    },
    [filter, userId, ko]
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_points_ledger" />

      {!action.allowed && action.reason ? (
        <p className="sam-text-helper text-sam-muted" data-admin-action-denied="1">
          {ko ? `지급·회수 버튼 비활성: ${action.reason}` : `Actions disabled: ${action.reason}`}
        </p>
      ) : null}

      <AdminPointAdjustPanel actionAllowed={action.allowed} onChanged={() => void load()} />

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder={safeT("point_fin_admin_user_filter", {
            fallbackKo: "회원 UUID (선택)",
            fallbackEn: "Member UUID (optional)",
          })}
          className="min-w-[240px] flex-1 rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
        />
        {(["all", "credit", "debit"] as const).map((id) => (
          <AdminChipButton key={id} selected={filter === id} onClick={() => setFilter(id)}>
            {ko ? LEDGER_FILTER_LABEL[id].ko : LEDGER_FILTER_LABEL[id].en}
          </AdminChipButton>
        ))}
        <AdminActionButton variant="primary" onClick={() => void load()}>
          {adminCta("search", ko)}
        </AdminActionButton>
      </div>

      {loading ? (
        <AdminLoadingState ko={ko} />
      ) : loadError ? (
        <AdminErrorState
          ko={ko}
          code={loadError.code}
          httpStatus={loadError.httpStatus}
          onRetry={() => void load()}
        />
      ) : items.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_points_ledger_empty")} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[720px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium">{t("admin_points_th_datetime")}</th>
                <th className="px-3 py-2.5 text-left font-medium">{t("admin_points_th_user")}</th>
                <th className="px-3 py-2.5 text-left font-medium">{t("admin_points_th_type")}</th>
                <th className="px-3 py-2.5 text-left font-medium">{ko ? "사용처" : "Usage"}</th>
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
                      {formatAdminManilaDateTime(e.occurredAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      {e.userNickname || "—"}{" "}
                      <AdminTechId id={e.userId} />
                    </td>
                    <td className="px-3 py-2.5">{title}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-sam-muted">{usage}</td>
                    <td
                      className={`px-3 py-2.5 text-right font-medium tabular-nums ${
                        e.direction === "credit" ? "text-sam-success" : "text-sam-danger"
                      }`}
                    >
                      {formatSigned(e.signedAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatAdminNumber(e.balanceAfter)}P</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {moreError ? (
        <p role="alert" className="sam-text-helper text-sam-danger">
          {moreError}
        </p>
      ) : null}
      {hasMore && !loadError ? (
        <AdminActionButton
          variant="secondary"
          className="w-full"
          onClick={() => void load({ append: true, cursor: nextCursor })}
        >
          {safeT("point_fin_load_more", { fallbackKo: "더 보기", fallbackEn: "Load more" })}
        </AdminActionButton>
      ) : null}
    </div>
  );
}
