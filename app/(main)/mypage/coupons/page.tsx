"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

const TABS = ["available", "expiring", "redeemed", "expired"] as const;

export default function MypageCouponsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<(typeof TABS)[number]>("available");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [authed, setAuthed] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/me/store-coupons?tab=${encodeURIComponent(tab)}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (res.status === 401) {
      setAuthed(false);
      setRows([]);
      return;
    }
    setAuthed(true);
    const json = (await res.json()) as { ok?: boolean; coupons?: Record<string, unknown>[] };
    setRows(json.ok ? json.coupons ?? [] : []);
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
      <MySubpageHeader titleKey="store_coupon_wallet_title" backHref="/mypage" />
      <div className="flex gap-2 px-4 py-3">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            className={`rounded-ui-rect px-3 py-1 text-sm ${tab === id ? "bg-sam-brand text-white" : "bg-sam-surface text-sam-fg"}`}
            onClick={() => setTab(id)}
          >
            {t(
              id === "available"
                ? "store_coupon_wallet_tab_available"
                : id === "expiring"
                  ? "store_coupon_wallet_tab_expiring"
                  : id === "redeemed"
                    ? "store_coupon_wallet_tab_redeemed"
                    : "store_coupon_wallet_tab_expired"
            )}
          </button>
        ))}
      </div>
      {!authed ? (
        <p className="px-4 text-sm text-sam-muted">{t("store_coupon_wallet_login")}</p>
      ) : rows.length === 0 ? (
        <p className="px-4 text-sm text-sam-muted">{t("store_coupon_wallet_empty")}</p>
      ) : (
        <ul className="space-y-2 px-4 pb-8">
          {rows.map((row) => (
            <li key={String(row.id)} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
              <p className="text-sm font-medium">
                {String(
                  ((row.store_coupon_campaigns as { title?: string } | null)?.title ?? t("store_coupon_wallet_title"))
                )}
              </p>
              <p className="mt-1 text-xs text-sam-muted">
                {String(row.store_id ?? "")} ·{" "}
                {(() => {
                  const c = row.store_coupon_campaigns as
                    | { discount_type?: string; discount_value?: number; min_order_amount?: number | null }
                    | null;
                  if (!c) return "";
                  const d =
                    c.discount_type === "percent" ? `${c.discount_value}%` : `₱${c.discount_value}`;
                  return `${d} · ${t("store_coupon_min_order")} ${c.min_order_amount ?? 0}`;
                })()}
              </p>
              <p className="mt-1 text-xs text-sam-muted">
                {t("store_coupon_usage_window")} {String(row.expires_at ?? "")} · {String(row.status ?? "")}
                {row.redeemed_order_id ? ` · ${String(row.redeemed_order_id)}` : ""}
                {row.status === "redeemed" && row.reserved_php != null ? ` · ₱${String(row.reserved_php)}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
