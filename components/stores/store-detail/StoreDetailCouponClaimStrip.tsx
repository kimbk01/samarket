"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoreCouponCustomerCard } from "@/components/stores/coupon/StoreCouponCustomerCard";
import type { CustomerCouponCardView } from "@/lib/stores/store-coupon-product-view";
import { writeStoreCouponHandoff } from "@/lib/stores/store-coupon-handoff";

type DetailCard = CustomerCouponCardView & {
  detailState: "login" | "claim" | "held" | "unusable" | "hidden";
};

export function StoreDetailCouponClaimStrip({ storeId }: { storeId: string }) {
  const { safeT, t } = useI18n();
  const pathname = usePathname();
  const [cards, setCards] = useState<DetailCard[]>([]);
  const [authed, setAuthed] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
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
        cards?: DetailCard[];
      };
      setAuthed(json.authed === true);
      setCards(json.ok ? json.cards ?? [] : []);
      setErr(null);
    } catch {
      setCards([]);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = cards.filter((c) => c.detailState !== "hidden");
  if (visible.length === 0 && authed) return null;
  if (!authed && visible.length === 0) {
    return (
      <section className="min-w-0 px-[var(--delivery-page-x)] py-2" data-store-coupon-detail-strip="1">
        <h2 className="mb-2 text-sm font-semibold text-sam-fg">{t("store_coupon_wallet_title")}</h2>
        <Link
          href={`/login?next=${encodeURIComponent(pathname || "/")}`}
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-ui-rect bg-signature px-3 text-sm font-medium text-white"
          data-store-coupon-detail-cta="login"
        >
          {safeT("store_coupon_detail_login", { fallbackKo: "로그인하고 받기", fallbackEn: "Sign in to get it" })}
        </Link>
      </section>
    );
  }

  const loginHref = `/login?next=${encodeURIComponent(pathname || "/")}`;

  return (
    <section
      className="min-w-0 px-[var(--delivery-page-x)] py-2"
      data-store-coupon-detail-strip="1"
      data-store-coupon-detail-block="1"
      data-store-coupon-offer-surface="1"
    >
      <h2 className="mb-2 text-sm font-semibold text-sam-fg">
        {safeT("store_coupon_offer_surface_title", { fallbackKo: "쿠폰 받기", fallbackEn: "Get coupons" })}
      </h2>
      <ul className="space-y-3">
        {visible.map((card) => {
          const state = !authed ? "login" : card.detailState;
          return (
            <li key={card.campaignId || card.entitlementId}>
              <StoreCouponCustomerCard
                card={card}
                detailState={state}
                loginHref={state === "login" ? loginHref : undefined}
                orderMenuHref={state === "held" ? "#store-menu-panel" : undefined}
                claimBusy={busyId === card.campaignId}
                claimLabel={safeT("store_coupon_claim", { fallbackKo: "쿠폰 받기", fallbackEn: "Get coupon" })}
                heldLabel={t("store_coupon_claimed")}
                unusableLabel={t("store_coupon_unusable")}
                onUse={
                  state === "held" && card.entitlementId
                    ? () => {
                        writeStoreCouponHandoff({
                          storeId,
                          userCouponId: card.entitlementId,
                          couponNumber: card.couponNumber ?? "",
                          offerId: card.campaignId,
                        });
                      }
                    : undefined
                }
                onClaim={
                  state === "claim"
                    ? () => {
                        void (async () => {
                          setBusyId(card.campaignId);
                          setErr(null);
                          try {
                            const res = await fetch("/api/me/store-coupons/claim", {
                              method: "POST",
                              credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ campaign_id: card.campaignId }),
                            });
                            const json = (await res.json()) as {
                              ok?: boolean;
                              entitlement?: {
                                id?: string;
                                coupon_number?: string | null;
                                campaign_id?: string;
                              };
                            };
                            if (!res.ok || !json.ok) {
                              setErr("unusable");
                              return;
                            }
                            const entId = String(json.entitlement?.id ?? "").trim();
                            if (entId) {
                              writeStoreCouponHandoff({
                                storeId,
                                userCouponId: entId,
                                couponNumber: String(json.entitlement?.coupon_number ?? "").trim(),
                                offerId: card.campaignId,
                              });
                            }
                            await load();
                          } finally {
                            setBusyId(null);
                          }
                        })();
                      }
                    : undefined
                }
              />
            </li>
          );
        })}
      </ul>
      {err ? <p className="mt-2 text-xs text-sam-danger">{t("store_coupon_unusable")}</p> : null}
    </section>
  );
}
