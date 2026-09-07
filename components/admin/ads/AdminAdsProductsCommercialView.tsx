"use client";

/**
 * CUT R6 — Products / pricing commercial control surface.
 * Live prices from existing authorities. Edit CTAs only where writers exist.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  ADS_PRODUCTS_PLACEMENTS_HREF,
  type AdsCommercialControlModel,
  type AdsCommercialProductCard,
} from "@/lib/admin/ads-commercial/products-control-model";
import { Sam } from "@/lib/ui/sam-component-classes";

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
        <p className="text-[11px] font-mono text-sam-muted">{card.productKey}</p>
      </header>

      <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="text-[11px] text-sam-muted">{ko ? "신청/등록 주체" : "Applicant"}</dt>
          <dd className="font-medium text-sam-fg">{ko ? card.applicantKo : card.applicantEn}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-sam-muted">{ko ? "결제" : "Payment"}</dt>
          <dd className="font-medium text-sam-fg">{ko ? card.paymentKo : card.paymentEn}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-sam-muted">{ko ? "승인" : "Approval"}</dt>
          <dd className="font-medium text-sam-fg">{ko ? card.approvalKo : card.approvalEn}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-sam-muted">{ko ? "Admin 직접 등록" : "Admin Direct"}</dt>
          <dd className="font-medium text-sam-fg">
            {ko ? card.adminDirectKo : card.adminDirectEn}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-sam-muted">{ko ? "판매 상태" : "Sell status"}</dt>
          <dd className="font-medium text-sam-fg" data-ads-sell-state={card.sellState}>
            {ko ? card.sellStateKo : card.sellStateEn}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-sam-muted">{ko ? "가격 authority" : "Price authority"}</dt>
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
                  ? ko
                    ? "오너 신청"
                    : "Owner apply"
                  : ko
                    ? "회원 신청"
                    : "Member apply"}
              </p>
              <p className="mt-1 text-[12px] text-sam-muted">
                {ko ? "결제" : "Payment"}: {ko ? card.memberPath.paymentKo : card.memberPath.paymentEn}
              </p>
              <p className="text-[12px] text-sam-muted">
                {ko ? "승인" : "Approval"}:{" "}
                {ko ? card.memberPath.approvalKo : card.memberPath.approvalEn}
              </p>
            </div>
          ) : null}
          {card.adminDirectPath ? (
            <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
              <p className="text-[12px] font-semibold text-sam-fg">
                {ko ? "Admin 직접 등록" : "Admin Direct"}
              </p>
              <p className="mt-1 text-[12px] text-sam-muted">
                {ko ? "결제" : "Payment"}:{" "}
                {ko ? card.adminDirectPath.paymentKo : card.adminDirectPath.paymentEn}
              </p>
              <p className="text-[12px] text-sam-muted">
                {ko ? "승인" : "Approval"}:{" "}
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
        <p className="text-[11px] font-semibold text-sam-muted">{ko ? "노출 위치" : "Placements"}</p>
        <ul className="mt-1 space-y-0.5 text-[13px] text-sam-fg">
          {card.placements.map((p) => (
            <li key={p.key}>
              <span>{ko ? p.labelKo : p.labelEn}</span>
              <span className="ml-2 font-mono text-[11px] text-sam-muted">{p.key}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-semibold text-sam-muted">
          {ko ? "현재 판매 가격" : "Current sale prices"}
        </p>
        {card.priceLines.length === 0 ? (
          <p className="mt-1 text-[13px] text-sam-muted">
            {ko ? "결제 없음 / 가격 없음" : "No payment / no price"}
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
                <p className="mt-0.5 font-mono text-[11px] text-sam-muted">{line.sku}</p>
              </li>
            ))}
          </ul>
        )}
        {!card.priceEditable ? (
          <p className="mt-2 text-[12px] text-sam-muted" data-ads-price-readonly="1">
            {ko ? "현재 시스템 설정 · 읽기 전용" : "Current system setting · read-only"}
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
          <Link href={card.editPriceHref} className={Sam.btn.primary} data-ads-edit-price="1">
            {ko ? "가격 설정" : "Set prices"}
          </Link>
        ) : null}
        {card.sellableEditable && card.editSellableHref ? (
          <Link
            href={card.editSellableHref}
            className={Sam.btn.secondary}
            data-ads-edit-sellable="1"
          >
            {ko ? "판매 상태 변경" : "Change sell status"}
          </Link>
        ) : null}
        <Link
          href={ADS_PRODUCTS_PLACEMENTS_HREF}
          className={Sam.btn.secondary}
          data-ads-placements-cta="1"
        >
          {ko ? "광고 위치 보기" : "View placements"}
        </Link>
        {card.registerHref ? (
          <Link href={card.registerHref} className={Sam.btn.secondary} data-ads-r2-register="1">
            {ko ? "Admin 등록" : "Admin register"}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export function AdminAdsProductsCommercialView() {
  const { language } = useI18n();
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
      setErr(
        json.error ||
          (ko ? "상품/가격 정보를 불러오지 못했습니다." : "Could not load products/pricing.")
      );
      setModel(null);
      return;
    }
    setModel(json.model);
  }, [ko]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5" data-admin-advertising-products="1" data-admin-ads-r6="1">
      <header className="space-y-1">
        <p className="text-[12px] text-sam-muted">
          <Link href="/admin/advertising" className="underline">
            {ko ? "광고 / 노출" : "Ads / Exposure"}
          </Link>
          {" › "}
          {ko ? "광고 상품 / 가격" : "Products / Pricing"}
        </p>
        <h1 className="text-lg font-semibold text-sam-fg">
          {ko ? "광고 상품 / 가격" : "Ad products / Pricing"}
        </h1>
        <p className="text-[13px] text-sam-muted">
          {ko
            ? "현재 판매·운영 상품과 가격 authority를 관리합니다. 과거 결제액은 변경되지 않습니다."
            : "Manage sellable products and price authority. Historical charges are never rewritten."}
        </p>
      </header>

      {model ? (
        <section
          className="grid gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-[13px] sm:grid-cols-2 lg:grid-cols-4"
          data-ads-commercial-summary="1"
        >
          <div>
            <p className="text-[11px] text-sam-muted">{ko ? "회원 결제" : "Member payment"}</p>
            <p className="font-semibold text-sam-fg">
              {ko ? model.summary.memberPaymentKo : model.summary.memberPaymentEn}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-sam-muted">{ko ? "매장 오너 결제" : "Owner payment"}</p>
            <p className="font-semibold text-sam-fg">
              {ko ? model.summary.ownerPaymentKo : model.summary.ownerPaymentEn}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-sam-muted">{ko ? "Admin 직접 등록" : "Admin Direct"}</p>
            <p className="font-semibold text-sam-fg">
              {ko ? model.summary.adminDirectKo : model.summary.adminDirectEn}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-sam-muted">Popup</p>
            <p className="font-semibold text-sam-fg">
              {ko ? model.summary.popupKo : model.summary.popupEn}
            </p>
          </div>
        </section>
      ) : null}

      {err ? (
        <p className="text-sm text-sam-danger" role="alert">
          {err}
        </p>
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
          <h2 className="text-[15px] font-bold text-sam-fg">
            {ko ? "미출시 위치" : "Not-released placements"}
          </h2>
          <p className="mt-1 text-[12px] text-sam-muted">
            {ko
              ? "정식 판매 상품이 아닙니다. 구매 CTA 없음."
              : "Not canonical sellable products. No purchase CTA."}
          </p>
          <ul className="mt-3 space-y-2">
            {model.secondaryNotSellable.map((row) => (
              <li
                key={row.key}
                className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[13px]"
              >
                <p className="font-medium text-sam-fg">{ko ? row.labelKo : row.labelEn}</p>
                <p className="font-mono text-[11px] text-sam-muted">{row.key}</p>
                <p className="text-[12px] text-sam-muted">{ko ? row.stateKo : row.stateEn}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
