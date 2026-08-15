"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayPrompt } from "@/components/ui/dibay-overlay";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import Link from "next/link";
import type { MessageKey } from "@/lib/i18n/messages";

type TradePostAdRow = {
  id: string;
  post_id: string;
  user_id: string;
  ad_product_id?: string | null;
  apply_status: string;
  point_cost: number;
  priority: number;
  start_at: string | null;
  end_at: string | null;
  admin_memo: string | null;
  created_at: string;
  post?: {
    id?: string;
    title?: string;
    status?: string;
    category_id?: string;
    region?: string;
    city?: string;
    author_nickname?: string;
  } | null;
  product?: {
    id?: string;
    name?: string;
    placement?: string;
    duration_days?: number;
    point_cost?: number;
    service_type?: string | null;
    region_target?: string | null;
    category_id?: string | null;
  } | null;
};

const FORMAT_GUIDE_KEYS: MessageKey[] = [
  "admin_trade_post_ads_format_1",
  "admin_trade_post_ads_format_2",
  "admin_trade_post_ads_format_3",
  "admin_trade_post_ads_format_4",
];

export function AdminTradePostAdsPage() {
  const { t } = useI18n();
  const placementLabel = useMemo(
    () => ({
      detail_bottom: t("admin_trade_post_ads_placement_detail_bottom"),
      list_top: t("admin_trade_post_ads_placement_list_top"),
      home_featured: t("admin_trade_post_ads_placement_home_featured"),
      premium_all: t("admin_trade_post_ads_placement_premium"),
    }),
    [t]
  );

  const [rows, setRows] = useState<TradePostAdRow[]>([]);
  const [holds, setHolds] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/admin/trade-post-ads", { cache: "no-store" }),
        fetch("/api/admin/trade-ad-point-holds", { cache: "no-store" }),
      ]);
      const j1 = (await r1.json()) as { ok?: boolean; rows?: TradePostAdRow[]; error?: string };
      const j2 = (await r2.json()) as { ok?: boolean; rows?: Record<string, unknown>[] };
      if (!r1.ok || !j1.ok) {
        setErr(j1.error ?? t("admin_trade_post_ads_list_load_failed"));
        setRows([]);
      } else {
        setRows(j1.rows ?? []);
      }
      if (r2.ok && j2.ok) setHolds(j2.rows ?? []);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (
    row: TradePostAdRow,
    action: "verify" | "activate" | "reject" | "end",
    extra?: { start_at?: string; end_at?: string; admin_memo?: string }
  ) => {
    setBusyId(row.id);
    setErr("");
    try {
      const res = await fetch(`/api/admin/trade-post-ads/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(extra ?? {}) }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? t("admin_trade_post_ads_action_failed"));
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const activateWithManualPeriod = async (row: TradePostAdRow) => {
    const start = await dibayPrompt({
      title: t("admin_trade_post_ads_prompt_start"),
      defaultValue: new Date().toISOString(),
    });
    if (start === null) return;
    const end = await dibayPrompt({
      title: t("admin_trade_post_ads_prompt_end"),
      defaultValue: "",
      required: true,
    });
    if (end === null || !end.trim()) {
      setErr(t("admin_trade_post_ads_end_required"));
      return;
    }
    await runAction(row, "activate", {
      start_at: start.trim() ? start.trim() : new Date().toISOString(),
      end_at: end.trim(),
    });
  };

  const stageRows = useMemo(() => {
    const by = {
      sellerApplied: [] as TradePostAdRow[],
      adminVerified: [] as TradePostAdRow[],
      adminActive: [] as TradePostAdRow[],
      closed: [] as TradePostAdRow[],
    };
    for (const row of rows) {
      const status = row.apply_status;
      if (status === "pending") by.sellerApplied.push(row);
      else if (status === "approved") by.adminVerified.push(row);
      else if (status === "active") by.adminActive.push(row);
      else by.closed.push(row);
    }
    return by;
  }, [rows]);

  const renderRows = (
    list: TradePostAdRow[],
    actions: (r: TradePostAdRow) => ReactNode,
    emptyText: string
  ) => {
    if (list.length === 0) return <p className="sam-text-body-secondary text-sam-muted">{emptyText}</p>;
    return (
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
        <table className="min-w-full text-left sam-text-body-secondary">
          <thead className="bg-sam-surface-muted text-sam-muted">
            <tr>
              <th className="px-3 py-2">{t("admin_trade_completion_status")}</th>
              <th className="px-3 py-2">{t("admin_trade_post_ads_th_product")}</th>
              <th className="px-3 py-2">{t("admin_trade_th_points")}</th>
              <th className="px-3 py-2">{t("admin_trade_post_ads_th_post")}</th>
              <th className="px-3 py-2">{t("admin_trade_post_ads_th_period")}</th>
              <th className="px-3 py-2">{t("admin_trade_post_ads_th_action")}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-t border-sam-border-soft">
                <td className="px-3 py-2 font-medium">{r.apply_status}</td>
                <td className="max-w-[180px] px-3 py-2 sam-text-helper">
                  <p className="font-medium text-sam-fg">{r.product?.name ?? t("admin_trade_post_ads_product_unlinked")}</p>
                  <p className="text-sam-muted">
                    {(r.product?.placement && placementLabel[r.product.placement as keyof typeof placementLabel]) ||
                      r.product?.placement ||
                      "slot-unknown"}{" "}
                    ·{" "}
                    {t("admin_trade_post_ads_duration_days", {
                      days: String(Math.max(1, Math.floor(Number(r.product?.duration_days ?? 0) || 0)) || "?"),
                    })}
                  </p>
                </td>
                <td className="px-3 py-2">{r.point_cost}</td>
                <td className="px-3 py-2">
                  <Link href={`/post/${r.post_id}`} className="text-blue-700 underline" target="_blank">
                    {(r.post?.title && r.post.title.slice(0, 20)) || `${r.post_id.slice(0, 8)}…`}
                  </Link>
                  <p className="sam-text-xxs text-sam-muted">
                    {r.post?.author_nickname ?? t("admin_trade_post_ads_author_fallback")} · {r.post?.status ?? "status?"}
                  </p>
                </td>
                <td className="max-w-[220px] px-3 py-2 text-sam-muted">
                  {r.start_at && r.end_at ? (
                    <>
                      {r.start_at}
                      <br />~ {r.end_at}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2">{actions(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader titleKey="admin_page_trade_post_ads" descriptionKey="admin_trade_post_ads_desc" />

      <p className="sam-text-body-secondary text-sam-muted">
        <Link href="/admin/trade-ad-policies" className="text-blue-700 underline">
          {t("admin_trade_post_ads_policies_link")}
        </Link>
      </p>
      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="mb-2 sam-text-body font-semibold text-sam-fg">{t("admin_trade_post_ads_format_title")}</h2>
        <ul className="list-disc space-y-1 pl-5 sam-text-helper text-sam-muted">
          {FORMAT_GUIDE_KEYS.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </section>

      {err ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 px-4 py-3 sam-text-body-secondary text-red-800">
          {err}
        </div>
      ) : null}

      {loading ? <p className="sam-text-body-secondary text-sam-muted">{t("common_loading")}</p> : null}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { labelKey: "admin_trade_post_ads_stage_seller" as const, value: stageRows.sellerApplied.length },
          { labelKey: "admin_trade_post_ads_stage_admin_verified" as const, value: stageRows.adminVerified.length },
          { labelKey: "admin_trade_post_ads_stage_active" as const, value: stageRows.adminActive.length },
          { labelKey: "admin_trade_post_ads_stage_closed" as const, value: stageRows.closed.length },
        ].map((card) => (
          <div key={card.labelKey} className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-center">
            <p className="sam-text-hero font-bold text-sam-fg">{card.value}</p>
            <p className="sam-text-helper text-sam-muted">{t(card.labelKey)}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-2 sam-text-body font-semibold text-sam-fg">{t("admin_trade_post_ads_section_1_title")}</h2>
        <p className="mb-2 sam-text-helper text-sam-muted">{t("admin_trade_post_ads_section_1_desc")}</p>
        {renderRows(
          stageRows.sellerApplied,
          (r) => (
            <>
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => void runAction(r, "verify")}
                className="mr-2 rounded-ui-rect bg-sam-primary px-2 py-1 sam-text-helper text-white hover:bg-sam-primary-hover active:bg-sam-primary-active disabled:bg-sam-primary-disabled disabled:opacity-100"
              >
                {t("admin_trade_post_ads_verify")}
              </button>
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => void runAction(r, "reject")}
                className="rounded-ui-rect border border-sam-border px-2 py-1 sam-text-helper disabled:opacity-50"
              >
                {t("admin_report_action_reject")}
              </button>
            </>
          ),
          t("admin_trade_post_ads_empty_applied")
        )}
      </section>

      <section>
        <h2 className="mb-2 sam-text-body font-semibold text-sam-fg">{t("admin_trade_post_ads_section_2_title")}</h2>
        <p className="mb-2 sam-text-helper text-sam-muted">{t("admin_trade_post_ads_section_2_desc")}</p>
        {renderRows(
          stageRows.adminVerified,
          (r) => (
            <>
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => void runAction(r, "activate")}
                className="mr-2 rounded-ui-rect bg-emerald-600 px-2 py-1 sam-text-helper text-white disabled:opacity-50"
              >
                {t("admin_trade_post_ads_activate_auto")}
              </button>
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => void activateWithManualPeriod(r)}
                className="mr-2 rounded-ui-rect border border-sam-border px-2 py-1 sam-text-helper disabled:opacity-50"
              >
                {t("admin_trade_post_ads_activate_manual")}
              </button>
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => void runAction(r, "reject")}
                className="rounded-ui-rect border border-sam-border px-2 py-1 sam-text-helper disabled:opacity-50"
              >
                {t("admin_report_action_reject")}
              </button>
            </>
          ),
          t("admin_trade_post_ads_empty_verified")
        )}
      </section>

      <section>
        <h2 className="mb-2 sam-text-body font-semibold text-sam-fg">{t("admin_trade_post_ads_section_3_title")}</h2>
        <p className="mb-2 sam-text-helper text-sam-muted">{t("admin_trade_post_ads_section_3_desc")}</p>
        {renderRows(
          stageRows.adminActive,
          (r) => (
            <button
              type="button"
              disabled={busyId === r.id}
              onClick={() => void runAction(r, "end")}
              className="rounded-ui-rect border border-sam-border px-2 py-1 sam-text-helper disabled:opacity-50"
            >
              {t("admin_trade_post_ads_end")}
            </button>
          ),
          t("admin_trade_post_ads_empty_active")
        )}
      </section>

      <section>
        <h2 className="mb-2 sam-text-body font-semibold text-sam-fg">{t("admin_trade_post_ads_section_4_title")}</h2>
        <p className="mb-2 sam-text-helper text-sam-muted">{t("admin_trade_post_ads_section_4_desc")}</p>
        {renderRows(
          stageRows.closed,
          () => <span className="sam-text-helper text-sam-muted">{t("admin_trade_post_ads_history_label")}</span>,
          t("admin_trade_post_ads_empty_history")
        )}
      </section>

      <section>
        <h2 className="mb-2 sam-text-body font-semibold text-sam-fg">{t("admin_trade_post_ads_holds_title")}</h2>
        {holds.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">{t("admin_trade_post_ads_no_holds")}</p>
        ) : (
          <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
            <table className="min-w-full text-left sam-text-body-secondary">
              <thead className="bg-sam-surface-muted text-sam-muted">
                <tr>
                  <th className="px-3 py-2">{t("admin_trade_completion_status")}</th>
                  <th className="px-3 py-2">{t("admin_trade_post_ads_th_amount")}</th>
                  <th className="px-3 py-2">{t("admin_trade_post_ads_th_ad_id")}</th>
                  <th className="px-3 py-2">{t("admin_trade_th_time")}</th>
                </tr>
              </thead>
              <tbody>
                {holds.map((h) => (
                  <tr key={String(h.id)} className="border-t border-sam-border-soft">
                    <td className="px-3 py-2">{String(h.status ?? "")}</td>
                    <td className="px-3 py-2">{String(h.amount ?? "")}</td>
                    <td className="px-3 py-2 font-mono sam-text-xxs">{String(h.trade_post_ad_id ?? "")}</td>
                    <td className="px-3 py-2 text-sam-muted">{String(h.created_at ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
