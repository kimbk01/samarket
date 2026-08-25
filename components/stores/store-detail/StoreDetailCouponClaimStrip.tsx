"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/css-vars";
import { resolveStoreCouponDetailUxState } from "@/lib/stores/store-coupon-detail-ux";
import { formatMoneyPhp } from "@/lib/utils/format";

type Claimable = {
  id: string;
  storeId: string;
  title?: string;
  discountType?: string;
  discountValue?: number;
  minOrderAmount?: number | null;
  claimed?: boolean;
};

function benefitLabel(row: Claimable): string {
  if (row.discountValue == null) return "";
  if (row.discountType === "percent") return `${row.discountValue}%`;
  return formatMoneyPhp(row.discountValue);
}

export function StoreDetailCouponClaimStrip({ storeId }: { storeId: string }) {
  const { safeT, t } = useI18n();
  const pathname = usePathname();
  const [row, setRow] = useState<Claimable | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [authed, setAuthed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sid = storeId.trim();
    if (!sid) return;
    try {
      const res = await fetch(`/api/me/store-coupons/claimable?storeId=${encodeURIComponent(sid)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        authed?: boolean;
        campaigns?: Claimable[];
        ineligibleReason?: string | null;
      };
      setAuthed(json.authed === true);
      setRow(json.ok && json.campaigns?.[0] ? json.campaigns[0] : null);
      setReason(json.ineligibleReason ?? null);
      setErr(null);
    } catch {
      setRow(null);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const state = resolveStoreCouponDetailUxState({
    authed,
    hasCampaign: Boolean(row),
    claimed: Boolean(row?.claimed),
    ineligibleReason: reason,
  });
  if (state === "hidden") return null;

  const loginHref = `/login?next=${encodeURIComponent(pathname || "/")}`;
  const title = String(row?.title ?? "").trim();
  const benefit = row ? benefitLabel(row) : "";

  return (
    <div
      className="min-w-0 px-[var(--delivery-page-x)] py-2"
      data-store-coupon-detail-strip="1"
      data-coupon-detail-state={state}
    >
      <div className="min-w-0 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
        {benefit ? <p className="min-w-0 break-words font-medium text-sam-fg">{benefit}</p> : null}
        {title ? <p className="mt-0.5 min-w-0 break-words text-sm text-sam-fg">{title}</p> : null}
        {row?.minOrderAmount != null ? (
          <p className="mt-1 text-xs text-sam-muted">
            {t("store_coupon_min_order")} {formatMoneyPhp(row.minOrderAmount)}
          </p>
        ) : null}
        {err ? <p className="mt-1 text-xs text-sam-danger">{t("store_coupon_unusable")}</p> : null}
        {state === "unusable" ? (
          <p className="mt-2 text-sm text-sam-muted">
            {reason === "first_order_ineligible" ? t("store_coupon_reason_first_order") : t("store_coupon_unusable")}
          </p>
        ) : null}
        {state === "login" ? (
          <Link href={loginHref} className={`${Sam.btn.primary} mt-3 inline-flex`}>
            {safeT("store_coupon_detail_login", { fallbackKo: "로그인하고 받기", fallbackEn: "Sign in to get it" })}
          </Link>
        ) : null}
        {state === "claim" ? (
          <button
            type="button"
            disabled={busy}
            className={`${Sam.btn.primary} mt-3`}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setErr(null);
                try {
                  const res = await fetch("/api/me/store-coupons/claim", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ campaign_id: row?.id }),
                  });
                  const json = (await res.json()) as { ok?: boolean };
                  if (!res.ok || !json.ok) {
                    setErr("unusable");
                    return;
                  }
                  await load();
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {safeT("store_coupon_claim", { fallbackKo: "쿠폰 받기", fallbackEn: "Get coupon" })}
          </button>
        ) : null}
        {state === "held" ? (
          <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-sam-muted">{t("store_coupon_claimed")}</p>
            <a href="#store-menu-panel" className={Sam.btn.primary}>
              {t("store_coupon_order_cta")}
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
