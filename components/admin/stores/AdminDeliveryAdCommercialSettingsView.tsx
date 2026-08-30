"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminCard } from "@/components/admin/AdminCard";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import type { DeliveryAdCommercialCatalogReadModel } from "@/lib/stores/advertising/delivery-ad-commercial-catalog";
import type { DeliveryAdPackageRow } from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import {
  deliveryAdCommercialPlacementLabel,
  formatDeliveryAdPhpMinor,
  parseDeliveryAdPhpMajorToMinor,
} from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import type { DeliveryAdProductKey } from "@/lib/stores/advertising/delivery-ad-product-registry";

type Catalog = DeliveryAdCommercialCatalogReadModel;

function productTitle(key: DeliveryAdProductKey, lang: "ko" | "en"): string {
  if (key === "store_sponsored") return lang === "en" ? "Store promotion" : "매장 홍보";
  return lang === "en" ? "Banner ad" : "배너 광고";
}

export function AdminDeliveryAdCommercialSettingsView() {
  const { language, safeT } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await adminFetch("/api/admin/delivery-ads/commercial", {
      credentials: "include",
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      catalog?: Catalog;
      error?: string;
    };
    if (!res.ok || !j.ok || !j.catalog) {
      setError(j.error ?? "load_failed");
      setCatalog(null);
      return;
    }
    setCatalog(j.catalog);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await adminFetch("/api/admin/delivery-ads/commercial", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        catalog?: Catalog;
        error?: string;
      };
      if (!res.ok || !j.ok || !j.catalog) {
        setError(j.error ?? "save_failed");
        return;
      }
      setCatalog(j.catalog);
      setMsg(lang === "en" ? "Saved" : "저장됨");
    } finally {
      setBusy(false);
    }
  };

  const packagesByProductPlacement = useMemo(() => {
    if (!catalog) return [];
    const keys: Array<{ product: DeliveryAdProductKey; inventory: string }> = [
      { product: "store_sponsored", inventory: "STORES_HOME_FEED" },
      { product: "store_sponsored", inventory: "STORES_CATEGORY_FEED" },
      { product: "banner", inventory: "STORES_HOME_HERO" },
      { product: "banner", inventory: "STORES_SEARCH_TOP" },
    ];
    return keys.map((k) => ({
      ...k,
      packages: catalog.packages
        .filter((p) => p.productKind === k.product && p.inventoryKey === k.inventory)
        .sort((a, b) => a.displayOrder - b.displayOrder || a.code.localeCompare(b.code)),
    }));
  }, [catalog]);

  return (
    <AdminDeliveryCmsChrome>
      <div className="space-y-4 pb-10" data-admin-delivery-ads-commercial="1">
        <div>
          <p className="text-[12px] text-sam-muted">Delivery › Ads › Settings</p>
          <h1 className="text-[20px] font-bold text-sam-fg">
            {safeT("admin_delivery_ads_commercial_title", {
              fallbackKo: "광고 상품 설정",
              fallbackEn: "Ad product settings",
            })}
          </h1>
          <p className="mt-1 text-[13px] text-sam-muted">
            {safeT("admin_delivery_ads_commercial_subtitle", {
              fallbackKo: "기간 패키지 · 가격 · 지면 판매 · Partner (Admin SSOT)",
              fallbackEn: "Packages · prices · placement sellability · Partner (Admin SSOT)",
            })}
          </p>
        </div>

      <div className="mb-1 flex flex-wrap items-center gap-3 text-[13px]">
        <Link href={DELIVERY_AD_ADMIN_ROUTES.hub} className="text-signature underline">
          {safeT("admin_delivery_ads_back", { fallbackKo: "광고 운영", fallbackEn: "Ad ops" })}
        </Link>
        <Link
          href="/admin/stores-home-shelves"
          className="text-sam-muted underline"
        >
          {safeT("admin_delivery_ads_exposure_policy_link", {
            fallbackKo: "노출(max/interval) 정책 — 별도 SSOT",
            fallbackEn: "Exposure (max/interval) policy — separate SSOT",
          })}
        </Link>
      </div>

      {error ? (
        <p className="mb-3 text-[13px] text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {msg ? <p className="mb-3 text-[13px] text-sam-muted">{msg}</p> : null}

      {!catalog ? (
        <p className="text-[13px] text-sam-muted">
          {safeT("admin_delivery_ads_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
        </p>
      ) : (
        <div className="space-y-4">
          <AdminCard titleKey="admin_delivery_ads_commercial_products">
            <div className="space-y-3">
              {catalog.products.map((p) => (
                <ProductRow
                  key={p.key}
                  product={p}
                  title={productTitle(p.key, lang)}
                  busy={busy}
                  lang={lang}
                  onSave={(patchBody) =>
                    void patch({
                      op: "update_product",
                      productKey: p.key,
                      reason: "admin_product_settings",
                      ...patchBody,
                    })
                  }
                />
              ))}
            </div>
          </AdminCard>

          <AdminCard titleKey="admin_delivery_ads_commercial_placements">
            <p className="mb-2 text-[12px] text-sam-muted">
              {safeT("admin_delivery_ads_commercial_placement_note", {
                fallbackKo: "판매 여부만 설정합니다. 삽입 간격·최대 개수는 노출 정책에서 관리합니다.",
                fallbackEn: "Controls sellability only. Insertion max/interval stay in exposure policy.",
              })}
            </p>
            <ul className="space-y-2">
              {catalog.placements.map((pl) => (
                <li
                  key={`${pl.productKind}:${pl.inventoryKey}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
                >
                  <div className="min-w-0 text-[13px]">
                    <div className="font-medium text-sam-fg">
                      {deliveryAdCommercialPlacementLabel(pl.inventoryKey, lang)}
                    </div>
                    <div className="text-[12px] text-sam-muted">{productTitle(pl.productKind, lang)}</div>
                  </div>
                  <label className="flex items-center gap-2 text-[12px]">
                    <input
                      type="checkbox"
                      checked={pl.sellable}
                      disabled={busy}
                      onChange={(e) =>
                        void patch({
                          op: "update_placement",
                          productKey: pl.productKind,
                          inventoryKey: pl.inventoryKey,
                          sellable: e.target.checked,
                          reason: "admin_placement_sellable",
                        })
                      }
                    />
                    {lang === "en" ? "Sellable" : "판매"}
                  </label>
                </li>
              ))}
            </ul>
          </AdminCard>

          <AdminCard titleKey="admin_delivery_ads_commercial_packages">
            <p className="mb-3 text-[12px] text-amber-800">
              {safeT("admin_delivery_ads_commercial_price_warn", {
                fallbackKo: "가격 변경은 기존 신청/구매 금액에 소급 적용되지 않습니다.",
                fallbackEn:
                  "Price changes do not apply retroactively to existing applications or purchases.",
              })}
            </p>
            <div className="space-y-5">
              {packagesByProductPlacement.map((group) => (
                <div key={`${group.product}:${group.inventory}`}>
                  <h3 className="mb-2 text-[13px] font-semibold text-sam-fg">
                    {productTitle(group.product, lang)} ·{" "}
                    {deliveryAdCommercialPlacementLabel(group.inventory, lang)}
                  </h3>
                  <div className="space-y-2">
                    {group.packages.map((pkg) => (
                      <PackageRow
                        key={pkg.id}
                        pkg={pkg}
                        busy={busy}
                        lang={lang}
                        onSave={(body) =>
                          void patch({
                            op: "update_package",
                            packageId: pkg.id,
                            reason: "admin_package_settings",
                            ...body,
                          })
                        }
                      />
                    ))}
                    <CreatePackageRow
                      product={group.product}
                      inventory={group.inventory}
                      busy={busy}
                      lang={lang}
                      onCreate={(body) =>
                        void patch({
                          op: "create_package",
                          productKey: group.product,
                          inventoryKey: group.inventory,
                          reason: "admin_create_package",
                          ...body,
                        })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </AdminCard>

          <AdminCard titleKey="admin_delivery_ads_commercial_extension">
            <ExtensionForm
              policy={catalog.extensionPolicy}
              busy={busy}
              lang={lang}
              onSave={(body) =>
                void patch({
                  op: "update_extension",
                  reason: "admin_extension_policy",
                  ...body,
                })
              }
            />
            <p className="mt-2 text-[12px] text-sam-muted">
              {safeT("admin_delivery_ads_commercial_extension_note", {
                fallbackKo: "캠페인별 무료 보상 연장은 운영 workspace에서 처리합니다.",
                fallbackEn: "Per-campaign free compensation extensions are handled in ops workspace.",
              })}
            </p>
          </AdminCard>

          <AdminCard titleKey="admin_delivery_ads_commercial_partner">
            <p className="mb-2 text-[12px] text-sam-muted">
              {safeT("admin_delivery_ads_commercial_partner_note", {
                fallbackKo:
                  "Partner는 월 정액 멤버십입니다. 광고 캠페인·organic ranking과 분리됩니다. 런치 혜택: 광고 패키지 할인.",
                fallbackEn:
                  "Partner is a monthly membership — separate from ad campaigns and organic ranking. Launch benefit: ad package discount.",
              })}
            </p>
            <PartnerForm
              config={catalog.partnerConfig}
              busy={busy}
              lang={lang}
              onSave={(body) =>
                void patch({
                  op: "update_partner",
                  reason: "admin_partner_settings",
                  ...body,
                })
              }
            />
          </AdminCard>
        </div>
      )}
      </div>
    </AdminDeliveryCmsChrome>
  );
}

function ProductRow(props: {
  product: Catalog["products"][number];
  title: string;
  busy: boolean;
  lang: "ko" | "en";
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(props.product.displayName);
  const [desc, setDesc] = useState(props.product.description ?? "");
  const [enabled, setEnabled] = useState(props.product.enabled);
  const [accepting, setAccepting] = useState(props.product.acceptingApplications);
  useEffect(() => {
    setName(props.product.displayName);
    setDesc(props.product.description ?? "");
    setEnabled(props.product.enabled);
    setAccepting(props.product.acceptingApplications);
  }, [props.product]);

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-app p-3">
      <div className="mb-2 text-[13px] font-semibold text-sam-fg">{props.title}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[12px]">
          {props.lang === "en" ? "Display name" : "표시 이름"}
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 text-[13px]"
            value={name}
            disabled={props.busy}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="text-[12px]">
          {props.lang === "en" ? "Description" : "설명"}
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 text-[13px]"
            value={desc}
            disabled={props.busy}
            onChange={(e) => setDesc(e.target.value)}
          />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-[12px]">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            disabled={props.busy}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          {props.lang === "en" ? "Enabled" : "활성"}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={accepting}
            disabled={props.busy}
            onChange={(e) => setAccepting(e.target.checked)}
          />
          {props.lang === "en" ? "Accept applications" : "신규 신청 접수"}
        </label>
        <button
          type="button"
          disabled={props.busy}
          className="rounded-ui-rect border border-sam-border px-3 py-1"
          onClick={() =>
            props.onSave({
              displayName: name,
              description: desc || null,
              enabled,
              acceptingApplications: accepting,
            })
          }
        >
          {props.lang === "en" ? "Save" : "저장"}
        </button>
      </div>
    </div>
  );
}

function PackageRow(props: {
  pkg: DeliveryAdPackageRow;
  busy: boolean;
  lang: "ko" | "en";
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [days, setDays] = useState(String(props.pkg.durationDays));
  const [price, setPrice] = useState(
    props.pkg.priceAmountMinor == null
      ? ""
      : (props.pkg.priceAmountMinor / 100).toFixed(2)
  );
  const [enabled, setEnabled] = useState(props.pkg.enabled);
  const [name, setName] = useState(props.pkg.displayName);
  useEffect(() => {
    setDays(String(props.pkg.durationDays));
    setPrice(
      props.pkg.priceAmountMinor == null
        ? ""
        : (props.pkg.priceAmountMinor / 100).toFixed(2)
    );
    setEnabled(props.pkg.enabled);
    setName(props.pkg.displayName);
  }, [props.pkg]);

  return (
    <div className="grid gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-2 sm:grid-cols-[1fr_5rem_7rem_auto_auto] sm:items-end">
      <label className="text-[12px]">
        {props.lang === "en" ? "Name" : "이름"}
        <input
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1 text-[13px]"
          value={name}
          disabled={props.busy}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="text-[12px]">
        {props.lang === "en" ? "Days" : "일수"}
        <input
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1 text-[13px]"
          value={days}
          disabled={props.busy}
          onChange={(e) => setDays(e.target.value)}
        />
      </label>
      <label className="text-[12px]">
        {props.lang === "en" ? "Price (PHP)" : "가격 (PHP)"}
        <input
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1 text-[13px]"
          placeholder="0.00"
          value={price}
          disabled={props.busy}
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>
      <label className="flex items-center gap-2 pb-1 text-[12px]">
        <input
          type="checkbox"
          checked={enabled}
          disabled={props.busy}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        {props.lang === "en" ? "On" : "판매"}
      </label>
      <button
        type="button"
        disabled={props.busy}
        className="rounded-ui-rect border border-sam-border px-3 py-1 text-[12px]"
        onClick={() => {
          const durationDays = Number(days);
          const priceAmountMinor = price.trim() === "" ? null : parseDeliveryAdPhpMajorToMinor(price);
          if (price.trim() !== "" && priceAmountMinor == null) return;
          props.onSave({
            displayName: name,
            durationDays,
            priceAmountMinor,
            enabled,
          });
        }}
      >
        {props.lang === "en" ? "Save" : "저장"}
      </button>
      <div className="text-[11px] text-sam-muted sm:col-span-5">
        {props.pkg.code} · {formatDeliveryAdPhpMinor(props.pkg.priceAmountMinor)} ·{" "}
        {props.pkg.enabled
          ? props.lang === "en"
            ? "enabled"
            : "활성"
          : props.lang === "en"
            ? "disabled / not configured"
            : "비활성·미설정"}
      </div>
    </div>
  );
}

function CreatePackageRow(props: {
  product: DeliveryAdProductKey;
  inventory: string;
  busy: boolean;
  lang: "ko" | "en";
  onCreate: (body: Record<string, unknown>) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [days, setDays] = useState("10");
  const [price, setPrice] = useState("");
  return (
    <div className="rounded-ui-rect border border-dashed border-sam-border p-2">
      <div className="mb-1 text-[12px] font-medium text-sam-fg">
        {props.lang === "en" ? "Add custom package" : "커스텀 패키지 추가"}
      </div>
      <div className="grid gap-2 sm:grid-cols-5">
        <input
          className="rounded-ui-rect border border-sam-border px-2 py-1 text-[12px]"
          placeholder="code"
          value={code}
          disabled={props.busy}
          onChange={(e) => setCode(e.target.value)}
        />
        <input
          className="rounded-ui-rect border border-sam-border px-2 py-1 text-[12px]"
          placeholder={props.lang === "en" ? "name" : "이름"}
          value={name}
          disabled={props.busy}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="rounded-ui-rect border border-sam-border px-2 py-1 text-[12px]"
          placeholder={props.lang === "en" ? "days" : "일수"}
          value={days}
          disabled={props.busy}
          onChange={(e) => setDays(e.target.value)}
        />
        <input
          className="rounded-ui-rect border border-sam-border px-2 py-1 text-[12px]"
          placeholder="PHP"
          value={price}
          disabled={props.busy}
          onChange={(e) => setPrice(e.target.value)}
        />
        <button
          type="button"
          disabled={props.busy}
          className="rounded-ui-rect border border-sam-border px-2 py-1 text-[12px]"
          onClick={() => {
            const priceAmountMinor =
              price.trim() === "" ? null : parseDeliveryAdPhpMajorToMinor(price);
            if (price.trim() !== "" && priceAmountMinor == null) return;
            props.onCreate({
              code,
              displayName: name,
              durationDays: Number(days),
              priceAmountMinor,
              enabled: false,
              displayOrder: 100,
            });
            setCode("");
            setName("");
            setDays("10");
            setPrice("");
          }}
        >
          {props.lang === "en" ? "Add" : "추가"}
        </button>
      </div>
    </div>
  );
}

function ExtensionForm(props: {
  policy: Catalog["extensionPolicy"];
  busy: boolean;
  lang: "ko" | "en";
  onSave: (body: Record<string, unknown>) => void;
}) {
  const p = props.policy;
  const [enabled, setEnabled] = useState(p?.extensionEnabled ?? false);
  const [price, setPrice] = useState(
    p?.additionalDayPriceMinor == null ? "" : (p.additionalDayPriceMinor / 100).toFixed(2)
  );
  const [minD, setMinD] = useState(String(p?.minimumExtensionDays ?? 1));
  const [maxD, setMaxD] = useState(String(p?.maximumExtensionDays ?? 30));
  useEffect(() => {
    setEnabled(p?.extensionEnabled ?? false);
    setPrice(
      p?.additionalDayPriceMinor == null ? "" : (p.additionalDayPriceMinor / 100).toFixed(2)
    );
    setMinD(String(p?.minimumExtensionDays ?? 1));
    setMaxD(String(p?.maximumExtensionDays ?? 30));
  }, [p]);

  return (
    <div className="grid gap-2 sm:grid-cols-4 sm:items-end">
      <label className="flex items-center gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={enabled}
          disabled={props.busy}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        {props.lang === "en" ? "Extension enabled" : "연장 허용"}
      </label>
      <label className="text-[12px]">
        {props.lang === "en" ? "Price / day (PHP)" : "추가 1일 가격"}
        <input
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1 text-[13px]"
          value={price}
          disabled={props.busy}
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>
      <label className="text-[12px]">
        min
        <input
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1 text-[13px]"
          value={minD}
          disabled={props.busy}
          onChange={(e) => setMinD(e.target.value)}
        />
      </label>
      <label className="text-[12px]">
        max
        <input
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1 text-[13px]"
          value={maxD}
          disabled={props.busy}
          onChange={(e) => setMaxD(e.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={props.busy}
        className="rounded-ui-rect border border-sam-border px-3 py-1 text-[12px] sm:col-span-4"
        onClick={() => {
          const additionalDayPriceMinor =
            price.trim() === "" ? null : parseDeliveryAdPhpMajorToMinor(price);
          if (price.trim() !== "" && additionalDayPriceMinor == null) return;
          props.onSave({
            extensionEnabled: enabled,
            additionalDayPriceMinor,
            minimumExtensionDays: Number(minD),
            maximumExtensionDays: Number(maxD),
          });
        }}
      >
        {props.lang === "en" ? "Save extension policy" : "연장 정책 저장"}
      </button>
    </div>
  );
}

function PartnerForm(props: {
  config: Catalog["partnerConfig"];
  busy: boolean;
  lang: "ko" | "en";
  onSave: (body: Record<string, unknown>) => void;
}) {
  const c = props.config;
  const [enabled, setEnabled] = useState(c?.enabled ?? false);
  const [accepting, setAccepting] = useState(c?.acceptingNewMembers ?? false);
  const [fee, setFee] = useState(
    c?.monthlyFeeMinor == null ? "" : (c.monthlyFeeMinor / 100).toFixed(2)
  );
  const [discount, setDiscount] = useState(String(c?.advertisingDiscountPercent ?? 0));
  useEffect(() => {
    setEnabled(c?.enabled ?? false);
    setAccepting(c?.acceptingNewMembers ?? false);
    setFee(c?.monthlyFeeMinor == null ? "" : (c.monthlyFeeMinor / 100).toFixed(2));
    setDiscount(String(c?.advertisingDiscountPercent ?? 0));
  }, [c]);

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="flex items-center gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={enabled}
          disabled={props.busy}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        {props.lang === "en" ? "Partner enabled" : "Partner 활성"}
      </label>
      <label className="flex items-center gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={accepting}
          disabled={props.busy}
          onChange={(e) => setAccepting(e.target.checked)}
        />
        {props.lang === "en" ? "Accept new members" : "신규 가입 접수"}
      </label>
      <label className="text-[12px]">
        {props.lang === "en" ? "Monthly fee (PHP)" : "월 회비 (PHP)"}
        <input
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1 text-[13px]"
          value={fee}
          disabled={props.busy}
          onChange={(e) => setFee(e.target.value)}
        />
      </label>
      <label className="text-[12px]">
        {props.lang === "en" ? "Ad discount %" : "광고 할인 %"}
        <input
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1 text-[13px]"
          value={discount}
          disabled={props.busy}
          onChange={(e) => setDiscount(e.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={props.busy}
        className="rounded-ui-rect border border-sam-border px-3 py-1 text-[12px] sm:col-span-2"
        onClick={() => {
          const monthlyFeeMinor = fee.trim() === "" ? null : parseDeliveryAdPhpMajorToMinor(fee);
          if (fee.trim() !== "" && monthlyFeeMinor == null) return;
          props.onSave({
            enabled,
            acceptingNewMembers: accepting,
            monthlyFeeMinor,
            advertisingDiscountPercent: Number(discount),
          });
        }}
      >
        {props.lang === "en" ? "Save Partner" : "Partner 저장"}
      </button>
    </div>
  );
}
