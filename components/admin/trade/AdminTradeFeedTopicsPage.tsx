"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useCategoryAdmin } from "@/components/admin/categories/useCategoryAdmin";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TradeSubtopicsPanel } from "@/components/admin/menus/TradeSubtopicsPanel";

/** Trade feed topics — mirrors community feed topics admin */
export function AdminTradeFeedTopicsPage() {
  const { t } = useI18n();
  const { list, loading, supabaseAvailable, load, handleDelete } = useCategoryAdmin();

  const parents = useMemo(
    () =>
      list
        .filter((c) => c.type === "trade" && c.parent_id == null)
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [list]
  );

  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    if (parents.length === 0) {
      setSelectedId("");
      return;
    }
    setSelectedId((prev) => (prev && parents.some((p) => p.id === prev) ? prev : parents[0]!.id));
  }, [parents]);

  const selected = selectedId ? parents.find((p) => p.id === selectedId) ?? null : null;

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_page_trade_feed_topics" backHref="/admin/menus/trade" />
      <p className="sam-text-body text-sam-muted">
        {t("admin_trade_feed_topics_intro_prefix")}{" "}
        <Link href="/admin/philife/topics" className="font-medium text-signature hover:underline">
          {t("admin_trade_feed_topics_link_philife")}
        </Link>
        {t("admin_trade_feed_topics_intro_mid")}{" "}
        <strong className="font-medium text-sam-fg">{t("admin_trade_feed_topics_intro_strong")}</strong>
        {t("admin_trade_feed_topics_intro_suffix")}{" "}
        <Link href="/admin/menus/trade" className="font-medium text-signature hover:underline">
          {t("admin_menu_menu_trade")}
        </Link>
        {t("admin_trade_feed_topics_intro_suffix2")}
      </p>

      {supabaseAvailable === false && (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-3 sam-text-body-secondary text-amber-800">
          {t("admin_trade_feed_topics_supabase_warn_prefix")}{" "}
          <code className="sam-text-helper">categories.parent_id</code>{" "}
          {t("admin_trade_feed_topics_supabase_warn_suffix")}
        </div>
      )}

      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-10 text-center sam-text-body text-sam-muted">
          {t("common_loading")}
        </div>
      ) : parents.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-10 text-center sam-text-body text-sam-muted">
          {t("admin_trade_feed_topics_empty_prefix")}{" "}
          <Link href="/admin/menus/trade" className="text-signature hover:underline">
            {t("admin_menu_menu_trade")}
          </Link>{" "}
          {t("admin_trade_feed_topics_empty_suffix")}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <label className="flex flex-col gap-1 sam-text-body-secondary">
              <span className="font-medium text-sam-fg">{t("admin_trade_feed_topics_parent_menu")}</span>
              <select
                className="min-w-[240px] rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.slug})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selected ? (
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <TradeSubtopicsPanel
                parent={selected}
                allCategories={list}
                onRefresh={load}
                onDelete={async (id) => {
                  await handleDelete(id);
                }}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
