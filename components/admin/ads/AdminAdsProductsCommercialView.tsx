"use client";

/**
 * CUT R6 — Products / pricing commercial control surface.
 * Live prices from existing authorities. Edit CTAs only where writers exist.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { translateBy } from "@/lib/i18n/translate-by";
import {
  ADS_PRODUCTS_PLACEMENTS_HREF,
  type AdsCommercialControlModel,
  type AdsCommercialProductCard,
} from "@/lib/admin/ads-commercial/products-control-model";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";

function ProductCard({ card, ko }: { card: AdsCommercialProductCard; ko: boolean }) {
  return (
    <article
      className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
      data-ads-product-key={card.productKey}
      data-ads-price-editable={card.priceEditable ? "1" : "0"}
      data-ads-sellable-editable={card.sellableEditable ? "1" : "0"}
    >
      <header className="space-y-1">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-sam-muted">
          {ko ? card.domainKo : card.domainEn}
        </p>
        <h2 className="text-[16px] font-bold text-sam-fg">
          {ko ? card.nameKo : card.nameEn}
        </h2>
        <p className="text-[12px] font-mono text-sam-muted">{card.productKey}</p>
      </header>

      <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="text-[12px] text-sam-muted">{translateBy(ko ? "ko" : "en", "admin_ads_applicant")}</dt>
          <dd className="font-medium text-sam-fg">{ko ? card.applicantKo : card.applicantEn}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-sam-muted">{translateBy(ko ? "ko" : "en", "admin_ads_payment")}</dt>
          <dd className="font-medium text-sam-fg">{ko ? card.paymentKo : card.paymentEn}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-sam-muted">{translateBy(ko ? "ko" : "en", "admin_ads_approval")}</dt>
          <dd className="font-medium text-sam-fg">{ko ? card.approvalKo : card.approvalEn}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-sam-muted">{translateBy(ko ? "ko" : "en", "admin_ads_admin_direct")}</dt>
          <dd className="font-medium text-sam-fg">
            {ko ? card.adminDirectKo : card.adminDirectEn}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] text-sam-muted">{translateBy(ko ? "ko" : "en", "admin_ads_sell_status")}</dt>
          <dd className="font-medium text-sam-fg" data-ads-sell-state={card.sellState}>
            {ko ? card.sellStateKo : card.sellStateEn}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] text-sam-muted">{translateBy(ko ? "ko" : "en", "admin_ads_price_authority")}</dt>
          <dd className="text-[12px] text-sam-muted">
            {ko ? card.priceAuthorityKo : card.priceAuthorityEn}
          </dd>
        </div>
      </dl>

      {card.memberPath || card.adminDirectPath ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2" data-ads-dual-path="1">
          {card.memberPath ? (
            <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
              <p className="text-[12px] font-semibold text-sam-fg">
                {card.productKey === "delivery_home_banner"
                  ? translateBy(ko ? "ko" : "en", "admin_ads_owner_apply")
                  : translateBy(ko ? "ko" : "en", "admin_ads_member_apply")}
              </p>
              <p className="mt-1 text-[12px] text-sam-muted">
                {translateBy(ko ? "ko" : "en", "admin_ads_payment")}: {ko ? card.memberPath.paymentKo : card.memberPath.paymentEn}
              </p>
              <p className="text-[12px] text-sam-muted">
                {translateBy(ko ? "ko" : "en", "admin_ads_approval")}:{" "}
                {ko ? card.memberPath.approvalKo : card.memberPath.approvalEn}
              </p>
            </div>
          ) : null}
          {card.adminDirectPath ? (
            <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
              <p className="text-[12px] font-semibold text-sam-fg">
                {translateBy(ko ? "ko" : "en", "admin_ads_admin_direct")}
              </p>
              <p className="mt-1 text-[12px] text-sam-muted">
                {translateBy(ko ? "ko" : "en", "admin_ads_payment")}:{" "}
                {ko ? card.adminDirectPath.paymentKo : card.adminDirectPath.paymentEn}
              </p>
              <p className="text-[12px] text-sam-muted">
                {translateBy(ko ? "ko" : "en", "admin_ads_approval")}:{" "}
                {ko ? card.adminDirectPath.approvalKo : card.adminDirectPath.approvalEn}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {card.popupOwnerSalesKo ? (
        <p className="mt-3 text-[12px] text-sam-muted" data-ads-popup-owner-sales="1">
          {ko ? card.popupOwnerSalesKo : card.popupOwnerSalesEn}
        </p>
      ) : null}

      <div className="mt-3">
        <p className="text-[12px] font-semibold text-sam-muted">{translateBy(ko ? "ko" : "en", "admin_ads_placements")}</p>
        <ul className="mt-1 space-y-0.5 text-[13px] text-sam-fg">
          {card.placements.map((p) => (
            <li key={p.key}>
              <span>{ko ? p.labelKo : p.labelEn}</span>
              <span className="ml-2 font-mono text-[12px] text-sam-muted">{p.key}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3">
        <p className="text-[12px] font-semibold text-sam-muted">
          {translateBy(ko ? "ko" : "en", "admin_ads_current_sale_prices")}
        </p>
        {card.priceLines.length === 0 ? (
          <p className="mt-1 text-[13px] text-sam-muted">
            {translateBy(ko ? "ko" : "en", "admin_ads_no_payment_no_price")}
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {card.priceLines.map((line) => (
              <li
                key={line.sku}
                className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[13px]"
                data-ads-price-sku={line.sku}
                data-ads-price-active={line.active ? "1" : "0"}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-sam-fg">
                    {ko ? line.labelKo : line.labelEn}
                  </span>
                  <span className="font-semibold text-sam-fg">
                    {ko ? line.priceTextKo : line.priceTextEn}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-[12px] text-sam-muted">{line.sku}</p>
              </li>
            ))}
          </ul>
        )}
        {!card.priceEditable ? (
          <p className="mt-2 text-[12px] text-sam-muted" data-ads-price-readonly="1">
            {translateBy(ko ? "ko" : "en", "admin_ads_current_system_setting_read")}
          </p>
        ) : null}
      </div>

      {(card.notesKo.length > 0 || card.notesEn.length > 0) && (
        <ul className="mt-3 list-disc space-y-0.5 pl-4 text-[12px] text-sam-muted">
          {(ko ? card.notesKo : card.notesEn).map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {card.priceEditable && card.editPriceHref ? (
          <AdminActionLink href={card.editPriceHref} variant="secondary" size="sm" data-ads-edit-price="1">
            {translateBy(ko ? "ko" : "en", "admin_ads_set_prices")}
          </AdminActionLink>
        ) : null}
        {card.sellableEditable && card.editSellableHref ? (
          <AdminActionLink
            href={card.editSellableHref}
            variant="secondary"
            size="sm"
            data-ads-edit-sellable="1"
          >
            {translateBy(ko ? "ko" : "en", "admin_ads_change_sell_status")}
          </AdminActionLink>
        ) : null}
        <AdminActionLink
          href={ADS_PRODUCTS_PLACEMENTS_HREF}
          variant="secondary"
          size="sm"
          data-ads-placements-cta="1"
        >
          {translateBy(ko ? "ko" : "en", "admin_ads_view_placements")}
        </AdminActionLink>
        {card.registerHref ? (
          <AdminActionLink href={card.registerHref} variant="secondary" size="sm" data-ads-r2-register="1">
            {translateBy(ko ? "ko" : "en", "admin_ads_admin_register")}
          </AdminActionLink>
        ) : null}
      </div>
    </article>
  );
}

export function AdminAdsProductsCommercialView() {
  const { language, t } = useI18n();
  const ko = language !== "en";
  const [model, setModel] = useState<AdsCommercialControlModel | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    const res = await fetch("/api/admin/advertising/products-commercial", {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      model?: AdsCommercialControlModel;
    };
    if (!res.ok || !json.ok || !json.model) {
      setErr(json.error || "load_failed");
      setModel(null);
      return;
    }
    setModel(json.model);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5" data-admin-advertising-products="1" data-admin-ads-r6="1">
      <header className="space-y-1">
        <p className="text-[12px] text-sam-muted">
          <Link href="/admin/advertising" className="underline">
            {t("admin_ads_ads_banners")}
          </Link>
          {" › "}
          {t("admin_ads_products_pricing")}
        </p>
        <h1 className="text-[20px] font-semibold text-sam-fg">
          {t("admin_menu_ads_authority_products")}
        </h1>
        <p className="text-[13px] text-sam-muted">
          {t("admin_ads_manage_sellable_products_price_authority")}
        </p>
      </header>

      {model ? (
        <section
          className="grid gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-[13px] sm:grid-cols-2 lg:grid-cols-4"
          data-ads-commercial-summary="1"
        >
          <div>
            <p className="text-[12px] text-sam-muted">{t("admin_ads_member_payment")}</p>
            <p className="font-semibold text-sam-fg">
              {ko ? model.summary.memberPaymentKo : model.summary.memberPaymentEn}
            </p>
          </div>
          <div>
            <p className="text-[12px] text-sam-muted">{t("admin_ads_owner_payment")}</p>
            <p className="font-semibold text-sam-fg">
              {ko ? model.summary.ownerPaymentKo : model.summary.ownerPaymentEn}
            </p>
          </div>
          <div>
            <p className="text-[12px] text-sam-muted">{t("admin_ads_admin_direct")}</p>
            <p className="font-semibold text-sam-fg">
              {ko ? model.summary.adminDirectKo : model.summary.adminDirectEn}
            </p>
          </div>
          <div>
            <p className="text-[12px] text-sam-muted">Popup</p>
            <p className="font-semibold text-sam-fg">
              {ko ? model.summary.popupKo : model.summary.popupEn}
            </p>
          </div>
        </section>
      ) : null}

      {err ? (
        <AdminErrorState ko={ko} code={err} onRetry={() => void load()} />
      ) : !model ? (
        <AdminLoadingState ko={ko} />
      ) : model.products.length === 0 ? (
        <AdminEmptyState ko={ko} />
      ) : null}

      <div className="grid gap-4">
        {(model?.products ?? []).map((card) => (
          <ProductCard key={card.productKey} card={card} ko={ko} />
        ))}
      </div>

      {model?.secondaryNotSellable?.length ? (
        <section
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
          data-ads-not-sellable="1"
        >
          <h2 className="text-[16px] font-bold text-sam-fg">
            {t("admin_ads_not_released_placements")}
          </h2>
          <p className="mt-1 text-[12px] text-sam-muted">
            {t("admin_ads_not_canonical_sellable_products_no")}
          </p>
          <ul className="mt-3 space-y-2">
            {model.secondaryNotSellable.map((row) => (
              <li
                key={row.key}
                className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[13px]"
              >
                <p className="font-medium text-sam-fg">{ko ? row.labelKo : row.labelEn}</p>
                <p className="font-mono text-[12px] text-sam-muted">{row.key}</p>
                <p className="text-[12px] text-sam-muted">{ko ? row.stateKo : row.stateEn}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
