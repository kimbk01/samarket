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
  DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT,
} from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import {
  deliveryAdCommercialPlacementLabel,
  parseDeliveryAdPhpMajorToMinor,
} from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import type { DeliveryAdProductKey } from "@/lib/stores/advertising/delivery-ad-product-registry";
import {
  R3_COMMERCIAL_MATRIX_DURATIONS,
  R3_COMMERCIAL_MATRIX_PRODUCTS,
  R3_COMMERCIAL_MATRIX_SEED_CODES,
  adminDeliveryAdProductHumanLabel,
  formatAdminDeliveryAdPriceOrUnset,
  isAdminDeliveryAdPriceUnset,
} from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";

type Catalog = DeliveryAdCommercialCatalogReadModel;

export function AdminDeliveryAdCommercialSettingsView() {
  const { language, safeT } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [extensionOpen, setExtensionOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customProduct, setCustomProduct] = useState<DeliveryAdProductKey>("store_sponsored");
  const [customInventory, setCustomInventory] = useState("STORES_HOME_FEED");

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

  const packageIndex = useMemo(() => {
    const map = new Map<string, DeliveryAdPackageRow>();
    if (!catalog) return map;
    for (const pkg of catalog.packages) {
      map.set(`${pkg.productKind}:${pkg.inventoryKey}:${pkg.durationDays}`, pkg);
      map.set(`${pkg.productKind}:${pkg.inventoryKey}:${pkg.code}`, pkg);
    }
    return map;
  }, [catalog]);

  return (
    <AdminDeliveryCmsChrome>
      <div
        className="space-y-4 pb-10"
        data-admin-delivery-ads-commercial="design-board"
      >
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
          <Link href="/admin/stores-home-shelves" className="text-sam-muted underline">
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
            {safeT("admin_delivery_ads_loading", {
              fallbackKo: "불러오는 중…",
              fallbackEn: "Loading…",
            })}
          </p>
        ) : (
          <div className="space-y-4">
            {/* Product acceptingApplications ON/OFF */}
            <AdminCard titleKey="admin_delivery_ads_commercial_products">
              <div className="space-y-3" data-commercial-product-accepting="1">
                {catalog.products.map((p) => (
                  <div
                    key={p.key}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
                  >
                    <div className="text-[13px] font-medium text-sam-fg">
                      {adminDeliveryAdProductHumanLabel(p.key, lang)}
                    </div>
                    <label className="flex items-center gap-2 text-[12px]">
                      <input
                        type="checkbox"
                        checked={p.acceptingApplications}
                        disabled={busy}
                        onChange={(e) =>
                          void patch({
                            op: "update_product",
                            productKey: p.key,
                            reason: "admin_product_settings",
                            displayName: p.displayName,
                            description: p.description,
                            enabled: p.enabled,
                            acceptingApplications: e.target.checked,
                          })
                        }
                      />
                      {safeT("admin_delivery_ads_commercial_accepting", {
                        fallbackKo: "신규 신청 접수",
                        fallbackEn: "Accept applications",
                      })}
                    </label>
                  </div>
                ))}
              </div>
            </AdminCard>

            <AdminCard titleKey="admin_delivery_ads_commercial_placements">
              <p className="mb-2 text-[12px] text-sam-muted">
                {safeT("admin_delivery_ads_commercial_placement_note", {
                  fallbackKo:
                    "판매 여부만 설정합니다. 삽입 간격·최대 개수는 노출 정책에서 관리합니다.",
                  fallbackEn:
                    "Controls sellability only. Insertion max/interval stay in exposure policy.",
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
                      <div className="text-[12px] text-sam-muted">
                        {adminDeliveryAdProductHumanLabel(pl.productKind, lang)}
                      </div>
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

            {/* Compact matrices — 2 products × placements × 7/15/30 */}
            <AdminCard titleKey="admin_delivery_ads_commercial_matrix_title">
              <div data-commercial-matrix="1">
              <p className="mb-3 text-[12px] text-amber-800">
                {safeT("admin_delivery_ads_commercial_price_warn", {
                  fallbackKo: "가격 변경은 기존 신청/구매 금액에 소급 적용되지 않습니다.",
                  fallbackEn:
                    "Price changes do not apply retroactively to existing applications or purchases.",
                })}
              </p>
              {R3_COMMERCIAL_MATRIX_PRODUCTS.map((product) => {
                const placements = DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT[product];
                return (
                  <div
                    key={product}
                    className="mb-5 last:mb-0"
                    data-commercial-matrix-product={product}
                  >
                    <h3 className="mb-2 text-[14px] font-semibold text-sam-fg">
                      {adminDeliveryAdProductHumanLabel(product, lang)}
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[480px] border-collapse text-[12px]" data-commercial-matrix-table="design-board">
                        <thead>
                          <tr className="bg-[#F5F5F5] text-left text-[#757575]">
                            <th className="border border-[#BDBDBD] p-2 font-semibold">
                              {lang === "en" ? "Placement" : "지면"}
                            </th>
                            {R3_COMMERCIAL_MATRIX_DURATIONS.map((d, i) => (
                              <th key={d} className="border border-[#BDBDBD] p-2 font-semibold">
                                {safeT("admin_delivery_ads_commercial_days_suffix", {
                                  fallbackKo: `${d}일`,
                                  fallbackEn: `${d} days`,
                                  vars: { n: d },
                                })}
                                <span className="ml-1 text-[10px] opacity-60">
                                  ({R3_COMMERCIAL_MATRIX_SEED_CODES[i]})
                                </span>
                              </th>
                            ))}
                            <th className="border border-[#BDBDBD] p-2 font-semibold">
                              {safeT("admin_delivery_ads_commercial_col_active", {
                                fallbackKo: "활성",
                                fallbackEn: "Active",
                              })}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {placements.map((inventory) => {
                            const placementRow = catalog.placements.find(
                              (p) => p.productKind === product && p.inventoryKey === inventory
                            );
                            return (
                            <tr key={inventory}>
                              <td className="border border-[#BDBDBD] p-2 align-top font-medium text-sam-fg">
                                {deliveryAdCommercialPlacementLabel(inventory, lang)}
                              </td>
                              {R3_COMMERCIAL_MATRIX_DURATIONS.map((days) => {
                                const pkg =
                                  packageIndex.get(`${product}:${inventory}:${days}`) ?? null;
                                return (
                                  <td
                                    key={days}
                                    className="border border-[#BDBDBD] p-2 align-top"
                                    data-matrix-cell={`${product}:${inventory}:${days}`}
                                  >
                                    <MatrixCell
                                      pkg={pkg}
                                      busy={busy}
                                      lang={lang}
                                      onSave={(body) => {
                                        if (!pkg) return;
                                        void patch({
                                          op: "update_package",
                                          packageId: pkg.id,
                                          reason: "admin_package_settings",
                                          ...body,
                                        });
                                      }}
                                    />
                                  </td>
                                );
                              })}
                              <td className="border border-[#BDBDBD] p-2 align-top">
                                <label className="flex items-center gap-2 text-[12px] font-medium text-sam-fg">
                                  <input
                                    type="checkbox"
                                    checked={placementRow?.sellable ?? false}
                                    disabled={busy || !placementRow}
                                    onChange={(e) => {
                                      if (!placementRow) return;
                                      void patch({
                                        op: "update_placement",
                                        productKey: product,
                                        inventoryKey: inventory,
                                        sellable: e.target.checked,
                                        reason: "admin_placement_sellable",
                                      });
                                    }}
                                  />
                                  {safeT("admin_delivery_ads_commercial_col_active", {
                                    fallbackKo: "활성",
                                    fallbackEn: "Active",
                                  })}
                                </label>
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}

              <div className="mt-3" data-commercial-custom-package="1">
                <button
                  type="button"
                  className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-[12px] font-medium"
                  onClick={() => setCustomOpen((v) => !v)}
                >
                  {safeT("admin_delivery_ads_commercial_custom_package", {
                    fallbackKo: "맞춤 패키지 추가",
                    fallbackEn: "Add custom package",
                  })}
                </button>
                {customOpen ? (
                  <div className="mt-2 rounded-ui-rect border border-dashed border-sam-border p-3">
                    <div className="mb-2 flex flex-wrap gap-2">
                      <select
                        className="rounded-ui-rect border border-sam-border px-2 py-1 text-[12px]"
                        value={customProduct}
                        disabled={busy}
                        onChange={(e) => {
                          const p = e.target.value as DeliveryAdProductKey;
                          setCustomProduct(p);
                          setCustomInventory(
                            DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT[p][0] ?? "STORES_HOME_FEED"
                          );
                        }}
                      >
                        {R3_COMMERCIAL_MATRIX_PRODUCTS.map((p) => (
                          <option key={p} value={p}>
                            {adminDeliveryAdProductHumanLabel(p, lang)}
                          </option>
                        ))}
                      </select>
                      <select
                        className="rounded-ui-rect border border-sam-border px-2 py-1 text-[12px]"
                        value={customInventory}
                        disabled={busy}
                        onChange={(e) => setCustomInventory(e.target.value)}
                      >
                        {DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT[customProduct].map((inv) => (
                          <option key={inv} value={inv}>
                            {deliveryAdCommercialPlacementLabel(inv, lang)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <CreatePackageRow
                      product={customProduct}
                      inventory={customInventory}
                      busy={busy}
                      lang={lang}
                      onCreate={(body) =>
                        void patch({
                          op: "create_package",
                          productKey: customProduct,
                          inventoryKey: customInventory,
                          reason: "admin_create_package",
                          ...body,
                        })
                      }
                    />
                  </div>
                ) : null}
              </div>
              </div>
            </AdminCard>

            {/* Extension collapsed */}
            <div
              className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
              data-commercial-extension-collapsed="1"
            >
              <button
                type="button"
                className="text-[13px] font-semibold text-sam-fg"
                onClick={() => setExtensionOpen((v) => !v)}
              >
                {safeT("admin_delivery_ads_commercial_extension_collapsed", {
                  fallbackKo: "연장 정책 (고급)",
                  fallbackEn: "Extension policy (advanced)",
                })}
              </button>
              {extensionOpen ? (
                <div className="mt-3">
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
                      fallbackEn:
                        "Per-campaign free compensation extensions are handled in ops workspace.",
                    })}
                  </p>
                </div>
              ) : null}
            </div>

            {/* Partner membership config — R4 live (not campaign product) */}
            <div
              className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
              data-commercial-partner="r4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[13px] font-semibold text-sam-fg">
                  {safeT("admin_delivery_ads_commercial_partner", {
                    fallbackKo: "Partner 멤버십",
                    fallbackEn: "Partner membership",
                  })}
                </h2>
                <Link
                  href={DELIVERY_AD_ADMIN_ROUTES.partnerMemberships}
                  className="text-[12px] font-medium text-signature underline"
                >
                  {safeT("admin_delivery_ads_partner_manage_link", {
                    fallbackKo: "가입 관리",
                    fallbackEn: "Manage memberships",
                  })}
                </Link>
              </div>
              <p className="mt-1 text-[12px] text-sam-muted">
                {safeT("admin_delivery_ads_commercial_partner_note", {
                  fallbackKo:
                    "광고 패키지 할인용 멤버십입니다. organic ranking과 분리 · 월 회비 결제는 미구현.",
                  fallbackEn:
                    "Membership for ad package discounts. Separate from organic ranking · monthly fee payment not implemented.",
                })}
              </p>
              <div className="mt-3">
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
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminDeliveryCmsChrome>
  );
}

function MatrixCell(props: {
  pkg: DeliveryAdPackageRow | null;
  busy: boolean;
  lang: "ko" | "en";
  onSave: (body: Record<string, unknown>) => void;
}) {
  const { pkg, busy, lang, onSave } = props;
  const [price, setPrice] = useState(
    pkg == null || isAdminDeliveryAdPriceUnset(pkg.priceAmountMinor)
      ? ""
      : (pkg.priceAmountMinor! / 100).toFixed(2)
  );
  const [enabled, setEnabled] = useState(pkg?.enabled ?? false);
  useEffect(() => {
    setPrice(
      pkg == null || isAdminDeliveryAdPriceUnset(pkg.priceAmountMinor)
        ? ""
        : (pkg.priceAmountMinor! / 100).toFixed(2)
    );
    setEnabled(pkg?.enabled ?? false);
  }, [pkg]);

  if (!pkg) {
    return (
      <span className="text-sam-muted">
        {formatAdminDeliveryAdPriceOrUnset(null, lang)}
      </span>
    );
  }

  return (
    <div className="space-y-1">
      <input
        className="w-full rounded-ui-rect border border-sam-border px-1.5 py-1 text-[12px]"
        placeholder={lang === "en" ? "Not set" : "미설정"}
        value={price}
        disabled={busy}
        onChange={(e) => setPrice(e.target.value)}
        data-price-null-safe="1"
      />
      <label className="flex items-center gap-1 text-[11px]">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        {lang === "en" ? "Active" : "활성"}
      </label>
      <button
        type="button"
        disabled={busy}
        className="rounded-ui-rect border border-sam-border px-2 py-0.5 text-[11px]"
        onClick={() => {
          const priceAmountMinor = price.trim() === "" ? null : parseDeliveryAdPhpMajorToMinor(price);
          if (price.trim() !== "" && priceAmountMinor == null) return;
          onSave({
            displayName: pkg.displayName,
            durationDays: pkg.durationDays,
            priceAmountMinor,
            enabled,
          });
        }}
      >
        {lang === "en" ? "Save" : "저장"}
      </button>
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
        placeholder={props.lang === "en" ? "Not set" : "미설정"}
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
          placeholder={props.lang === "en" ? "Not set" : "미설정"}
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
          placeholder={props.lang === "en" ? "Not set" : "미설정"}
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
