"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatCouponWalletDay } from "@/lib/stores/customer-coupon-wallet-view";
import { resolveStoreCouponDetailUxState } from "@/lib/stores/store-coupon-detail-ux";
import { formatMoneyPhp } from "@/lib/utils/format";

type Claimable = {
  id: string;
  storeId: string;
  title?: string;
  discountType?: string;
  discountValue?: number;
  minOrderAmount?: number | null;
  startAt?: string;
  endAt?: string;
  claimed?: boolean;
};

function benefitLabel(row: Claimable): string {
  if (row.discountValue == null) return "";
  if (row.discountType === "percent") return `${row.discountValue}%`;
  return formatMoneyPhp(row.discountValue);
}

const CTA_PRIMARY =
  "mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-ui-rect bg-signature px-3 text-sm font-medium text-white disabled:opacity-50";

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
  const periodStart = formatCouponWalletDay(row?.startAt);
  const periodEnd = formatCouponWalletDay(row?.endAt);
  const period = periodStart && periodEnd ? `${periodStart} – ${periodEnd}` : periodEnd || periodStart;
  const statusLabel =
    state === "held"
      ? t("store_coupon_claimed")
      : state === "login"
        ? t("store_coupon_detail_login")
        : state === "unusable"
          ? t("store_coupon_unusable")
          : t("store_coupon_claim");

  return (
    <section
      className="min-w-0 px-[var(--delivery-page-x)] py-2"
      data-store-coupon-detail-strip="1"
      data-store-coupon-detail-block="1"
      data-coupon-detail-state={state}
    >
      <h2 className="mb-2 text-sm font-semibold text-sam-fg">{t("store_coupon_wallet_title")}</h2>
      <div className="min-w-0 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
        <div className="flex min-w-0">
          <div className="w-1 shrink-0 bg-signature" aria-hidden data-store-coupon-detail-accent="1" />
          <div className="min-w-0 flex-1 p-3">
            {benefit ? (
              <div className="flex min-w-0 items-start justify-between gap-2">
                <p className="min-w-0 break-words text-lg font-bold text-sam-fg" data-store-coupon-detail-benefit="1">
                  {benefit}
                </p>
                <span
                  className="shrink-0 rounded-ui-rect bg-sam-app px-2 py-1 text-xs font-medium text-sam-fg"
                  data-store-coupon-detail-status="1"
                >
                  {statusLabel}
                </span>
              </div>
            ) : null}
            {title ? (
              <p className="mt-1 min-w-0 break-words text-sm text-sam-fg" data-store-coupon-detail-title="1">
                {title}
              </p>
            ) : null}
            {row?.minOrderAmount != null ? (
              <p className="mt-1 text-xs text-sam-muted" data-store-coupon-detail-condition="1">
                {t("store_coupon_min_order")} {formatMoneyPhp(row.minOrderAmount)}
              </p>
            ) : null}
            {period ? (
              <p className="mt-1 text-xs text-sam-muted" data-store-coupon-detail-period="1">
                {t("store_coupon_issue_window")} {period}
              </p>
            ) : null}
            {err ? <p className="mt-1 text-xs text-sam-danger">{t("store_coupon_unusable")}</p> : null}
            {state === "unusable" ? (
              <p className="mt-2 text-sm text-sam-muted" data-store-coupon-detail-unusable="1">
                {reason === "first_order_ineligible" ? t("store_coupon_reason_first_order") : t("store_coupon_unusable")}
              </p>
            ) : null}
            {state === "login" ? (
              <Link href={loginHref} className={CTA_PRIMARY} data-store-coupon-detail-cta="login">
                {safeT("store_coupon_detail_login", { fallbackKo: "로그인하고 받기", fallbackEn: "Sign in to get it" })}
              </Link>
            ) : null}
            {state === "claim" ? (
              <button
                type="button"
                disabled={busy}
                className={CTA_PRIMARY}
                data-store-coupon-detail-cta="claim"
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
              <a href="#store-menu-panel" className={CTA_PRIMARY} data-store-coupon-detail-cta="order">
                {t("store_coupon_claimed")} · {t("store_coupon_order_cta")}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
