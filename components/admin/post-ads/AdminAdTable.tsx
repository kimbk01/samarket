"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AdminPostAdRow, AdType } from "@/lib/ads/types";
import { AdStatusBadge } from "@/components/ads/AdStatusBadge";

const POST_AD_TYPE_KEYS: Record<AdType, MessageKey> = {
  top_fixed: "admin_ads_post_type_top_fixed",
  mid_insert: "admin_ads_post_type_mid_insert",
  highlight: "admin_ads_post_type_highlight",
};

interface AdminAdTableProps {
  rows: AdminPostAdRow[];
}

export function AdminAdTable({ rows }: AdminAdTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");

  const headers = useMemo(
    () =>
      [
        "admin_ads_post_col_post",
        "admin_ads_label_advertiser",
        "admin_ads_label_board",
        "admin_ads_post_col_product",
        "admin_ads_post_col_type",
        "admin_ads_col_status",
        "admin_ads_post_col_points",
        "admin_ads_post_col_period",
        "admin_ads_col_applied_at",
        "admin_ads_post_col_action",
      ] as MessageKey[],
    []
  );

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
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center sam-text-body-secondary text-sam-muted">
        {t("admin_ads_empty_none")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      {err ? (
        <p className="mb-2 rounded bg-red-50 px-3 py-2 sam-text-helper text-red-700">{err}</p>
      ) : null}
      <table className="w-full min-w-[800px] border-collapse sam-text-body-secondary">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            {headers.map((key) => (
              <th key={key} className="px-3 py-2 text-left font-semibold text-sam-muted">
                {t(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const busy = busyId === row.id;
            const note = noteInputs[row.id] ?? "";
            return (
              <tr key={row.id} className="border-b border-sam-border-soft hover:bg-sam-app">
                <td className="max-w-[160px] truncate px-3 py-2 font-medium text-sam-fg">
                  {row.postTitle}
                </td>
                <td className="px-3 py-2 text-sam-fg">{row.userNickname}</td>
                <td className="px-3 py-2 text-sam-muted">{row.boardKey}</td>
                <td className="px-3 py-2 text-sam-fg">{row.adProductName}</td>
                <td className="px-3 py-2 text-sam-muted">{t(POST_AD_TYPE_KEYS[row.adType])}</td>
                <td className="px-3 py-2">
                  <AdStatusBadge status={row.applyStatus} />
                </td>
                <td className="px-3 py-2 text-right text-sam-fg">
                  {row.pointCost.toLocaleString()}P
                </td>
                <td className="px-3 py-2 text-sam-muted">
                  {row.startAt
                    ? `${new Date(row.startAt).toLocaleDateString("ko-KR")}~${new Date(row.endAt ?? "").toLocaleDateString("ko-KR")}`
                    : "-"}
                </td>
                <td className="px-3 py-2 text-sam-muted">
                  {new Date(row.createdAt).toLocaleDateString("ko-KR")}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1.5">
                    <input
                      type="text"
                      value={note}
                      onChange={(e) =>
                        setNoteInputs((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      placeholder={t("admin_ads_post_admin_note_short")}
                      className="w-36 rounded border border-sam-border px-2 py-1 sam-text-helper"
                    />
                    <div className="flex flex-wrap gap-1">
                      {row.applyStatus === "pending_review" ||
                      row.applyStatus === "pending_payment" ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void doAction(row.id, "approve", note)}
                            className="rounded bg-emerald-600 px-2 py-1 sam-text-xxs font-semibold text-white disabled:opacity-50"
                          >
                            {t("admin_ads_action_approve")}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void doAction(row.id, "reject", note)}
                            className="rounded bg-red-500 px-2 py-1 sam-text-xxs font-semibold text-white disabled:opacity-50"
                          >
                            {t("admin_ads_action_reject")}
                          </button>
                        </>
                      ) : null}
                      {row.applyStatus === "active" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void doAction(row.id, "expire", note)}
                          className="rounded bg-sam-muted px-2 py-1 sam-text-xxs font-semibold text-white disabled:opacity-50"
                        >
                          {t("admin_ads_action_force_end")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void doAction(row.id, "cancel", note)}
                        className="rounded border border-sam-border bg-sam-surface px-2 py-1 sam-text-xxs text-sam-muted disabled:opacity-50"
                      >
                        {t("common_cancel")}
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
