"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/css-vars";
import Link from "next/link";

type Claimable = {
  id: string;
  storeId: string;
  title?: string;
  discountType?: string;
  discountValue?: number;
  minOrderAmount?: number | null;
  claimed?: boolean;
};

export function StoreDetailCouponClaimStrip({ storeId }: { storeId: string }) {
  const { safeT, t } = useI18n();
  const [row, setRow] = useState<Claimable | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const sid = storeId.trim();
    if (!sid) return;
    try {
      const res = await fetch(`/api/me/store-coupons/claimable?storeId=${encodeURIComponent(sid)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        setRow(null);
        setReason(null);
        return;
      }
      const json = (await res.json()) as {
        ok?: boolean;
        campaigns?: Claimable[];
        ineligibleReason?: string | null;
      };
      setRow(json.ok && json.campaigns?.[0] ? json.campaigns[0] : null);
      setReason(json.ineligibleReason ?? null);
    } catch {
      setRow(null);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!row && !reason) return null;

  const label =
    row?.discountType === "percent"
      ? `${row.discountValue ?? ""}%`
      : row?.discountValue != null
        ? String(row.discountValue)
        : "";

  return (
    <div className="px-[var(--delivery-page-x)] py-2">
      {row?.claimed ? (
        <div className="flex items-center justify-between gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
          <p className="text-sm">
            {label} {t("store_coupon_claimed")}
          </p>
          <Link href="#store-menus" className={Sam.btn.primary}>
            {t("store_coupon_order_cta")}
          </Link>
        </div>
      ) : row ? (
        <button
          type="button"
          disabled={busy}
          className={Sam.btn.primary}
          onClick={() => {
            void (async () => {
              setBusy(true);
              try {
                await fetch("/api/me/store-coupons/claim", {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ campaign_id: row.id }),
                });
                await load();
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {safeT("store_coupon_claim", { fallbackKo: "쿠폰 받기", fallbackEn: "Get coupon" })}
          {label ? ` · ${label}` : ""}
        </button>
      ) : reason === "first_order_ineligible" ? (
        <p className="text-sm text-sam-muted">{t("store_coupon_reason_first_order")}</p>
      ) : null}
    </div>
  );
}
