"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminDeliveryAdsSectionNav } from "@/components/admin/stores/AdminDeliveryAdsSectionNav";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import {
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
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
import {
  DELIVERY_AD_OPEN_EVENT_COMMERCIAL,
  countUnsetSellablePackageSlots,
} from "@/lib/stores/advertising/delivery-ad-open-event-commercial";

type Catalog = DeliveryAdCommercialCatalogReadModel;

export function AdminDeliveryAdCommercialSettingsView() {
  const { language, safeT, t } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [extensionOpen, setExtensionOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
    const ko = lang !== "en";
    const op = String(body.op ?? "");
    const title =
      op === "create_package"
        ? ko
          ? "맞춤 패키지를 등록할까요?"
          : "Create this custom package?"
        : op === "update_extension"
          ? ko
            ? "연장 정책을 저장할까요?"
            : "Save the extension policy?"
          : op === "update_product" || op === "update_placement"
            ? ko
              ? "판매 설정을 저장할까요?"
              : "Save the sales setting?"
            : ko
              ? "광고 가격을 저장할까요?"
              : "Save the ad price?";
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title,
      description: ko
        ? "신규 신청부터 적용됩니다. 이미 승인된 광고에는 소급되지 않습니다."
        : "Applies to new applications only. Approved campaigns are not changed.",
      confirmLabel: adminCta(op === "create_package" ? "create" : "save", ko),
    });
    if (!confirmed.ok) return;
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
      setMsg(lang === "en" ? "Saved." : "저장했습니다.");
    } finally {
      setBusy(false);
    }
  };

  /**
   * 가격표 한 행(지면)의 바뀐 기간 칸들을 한 번에 저장 — R7 버튼 배치(행당 버튼 1개).
   * 확인 단계는 칸별 저장과 같은 `save` 1회(대상·변경 내용 표시), 요청은 패키지마다 기존 `update_package` 그대로.
   * 하나라도 실패하면 거기서 멈추고 오류를 보인다 (앞서 저장된 칸은 서버 카탈로그로 반영).
   */
  const patchPackages = async (targetLabel: string, bodies: Array<{ label: string; body: Record<string, unknown> }>) => {
    if (bodies.length === 0) return;
    const ko = lang !== "en";
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: ko ? "광고 가격을 저장할까요?" : "Save the ad price?",
      description: `${targetLabel} · ${bodies.map((b) => b.label).join(", ")} — ${
        ko
          ? "신규 신청부터 적용됩니다. 이미 승인된 광고에는 소급되지 않습니다."
          : "Applies to new applications only. Approved campaigns are not changed."
      }`,
      confirmLabel: adminCta("save", ko),
    });
    if (!confirmed.ok) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      for (const { body } of bodies) {
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
      }
      setMsg(lang === "en" ? "Saved." : "저장했습니다.");
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

  const unsetMatrixSlotCount = useMemo(() => {
    if (!catalog) return 0;
    const packages: Array<{ priceAmountMinor: number | null; enabled: boolean }> = [];
    for (const product of R3_COMMERCIAL_MATRIX_PRODUCTS) {
      const placements = DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT[product];
      for (const inv of placements) {
        for (let i = 0; i < R3_COMMERCIAL_MATRIX_DURATIONS.length; i++) {
          const days = R3_COMMERCIAL_MATRIX_DURATIONS[i]!;
          const code = R3_COMMERCIAL_MATRIX_SEED_CODES[i]!;
          const pkg =
            packageIndex.get(`${product}:${inv}:${days}`) ??
            packageIndex.get(`${product}:${inv}:${code}`) ??
            null;
          packages.push(
            pkg
              ? { priceAmountMinor: pkg.priceAmountMinor, enabled: pkg.enabled }
              : { priceAmountMinor: null, enabled: false }
          );
        }
      }
    }
    return countUnsetSellablePackageSlots({ packages });
  }, [catalog, packageIndex]);

  return (
    <AdminDeliveryCmsChrome>
      <div
        className="space-y-4 pb-10"
        data-admin-delivery-ads-commercial="design-board"
      >
        <div>
          <p className="text-[12px] text-sam-muted">Delivery › Ads › Settings</p>
          <h1 className="text-[20px] font-bold text-sam-fg">
            {t("admin_menu_delivery_ads_commercial")}
          </h1>
          <p className="mt-1 text-[13px] text-sam-muted">
            {safeT("admin_delivery_ads_commercial_subtitle", {
              fallbackKo: "기간 패키지 · 가격 · 지면 판매 · Partner (Admin SSOT)",
              fallbackEn: "Packages · prices · placement sellability · Partner (Admin SSOT)",
            })}
          </p>
        </div>

        <AdminDeliveryAdsSectionNav />
        <p className="mb-1 text-[12px]">
          <Link
            href="/admin/stores-home-shelves"
            className="font-medium text-sam-muted hover:text-sam-primary"
          >
            {safeT("admin_delivery_ads_exposure_policy_link", {
              fallbackKo: "노출(max/interval) 정책 — 별도 SSOT",
              fallbackEn: "Exposure (max/interval) policy — separate SSOT",
            })}
          </Link>
        </p>

        {error && catalog ? (
          <div className="mb-3">
            <AdminResultBanner
              ko={lang !== "en"}
              result={{ ok: false, code: error }}
              onClose={() => setError(null)}
            />
          </div>
        ) : null}
        {msg ? (
          <div className="mb-3">
            <AdminResultBanner
              ko={lang !== "en"}
              result={{ ok: true, message: msg }}
              onClose={() => setMsg(null)}
            />
          </div>
        ) : null}

        {!catalog ? (
          error ? (
            <AdminErrorState ko={lang !== "en"} code={error} onRetry={() => void load()} />
          ) : (
            <AdminLoadingState
              ko={lang !== "en"}
              label={safeT("admin_delivery_ads_loading", {
                fallbackKo: "불러오는 중…",
                fallbackEn: "Loading…",
              })}
            />
          )
        ) : (
          <div className="space-y-4">
            <div
              className="rounded-ui-rect border border-sam-primary/35 bg-sam-primary/5 px-3 py-3"
              data-commercial-open-event-notice="1"
            >
              <p className="text-[14px] font-bold text-sam-fg">
                {lang === "en"
                  ? DELIVERY_AD_OPEN_EVENT_COMMERCIAL.labelEn
                  : DELIVERY_AD_OPEN_EVENT_COMMERCIAL.labelKo}
              </p>
              <p className="mt-1 text-[12px] text-sam-muted">
                {lang === "en"
                  ? DELIVERY_AD_OPEN_EVENT_COMMERCIAL.changeableEn
                  : DELIVERY_AD_OPEN_EVENT_COMMERCIAL.changeableKo}
              </p>
              <p className="mt-1 text-[12px] font-medium text-sam-fg">
                {lang === "en"
                  ? DELIVERY_AD_OPEN_EVENT_COMMERCIAL.grandfatherEn
                  : DELIVERY_AD_OPEN_EVENT_COMMERCIAL.grandfatherKo}
              </p>
            </div>

            {unsetMatrixSlotCount > 0 ? (
              <p
                className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 text-[13px] font-semibold text-sam-fg"
                role="status"
                data-commercial-unset-warning-count={unsetMatrixSlotCount}
              >
                {safeT("admin_delivery_ads_unset_price_summary", {
                  vars: { count: unsetMatrixSlotCount },
                  fallbackKo: `확인이 필요한 광고 가격이 ${unsetMatrixSlotCount}개 있습니다.`,
                  fallbackEn: `${unsetMatrixSlotCount} ad prices need attention.`,
                })}
              </p>
            ) : null}

            {/* UI-2 — price matrix primary */}
            <AdminCard titleKey="admin_delivery_ads_commercial_matrix_title">
              <div data-commercial-matrix="1">
              <p className="mb-3 text-[12px] text-sam-warning">
                {safeT("admin_delivery_ads_commercial_price_warn", {
                  fallbackKo:
                    "가격 변경은 이미 승인된 광고의 commercial snapshot에 소급 적용되지 않습니다. 신규 신청부터 새 가격이 적용됩니다.",
                  fallbackEn:
                    "Price changes do not retroactively change approved campaign commercial snapshots. New applications use the new price.",
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
                          <tr className="bg-sam-surface-muted text-left text-sam-muted">
                            <th className="border border-sam-border p-2 font-semibold">
                              {lang === "en" ? "Placement" : "지면"}
                            </th>
                            {R3_COMMERCIAL_MATRIX_DURATIONS.map((d) => (
                              <th
                                key={d}
                                className="border border-sam-border p-2 font-semibold tabular-nums"
                              >
                                {d}
                                {lang === "en" ? "d" : "일"}
                              </th>
                            ))}
                            <th className="border border-sam-border p-2 font-semibold">
                              <span className="sr-only">{adminCta("save", lang !== "en")}</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {placements.map((inv) => (
                            <MatrixRow
                              key={inv}
                              label={deliveryAdCommercialPlacementLabel(inv, lang)}
                              pkgs={R3_COMMERCIAL_MATRIX_DURATIONS.map((days, i) => {
                                const code = R3_COMMERCIAL_MATRIX_SEED_CODES[i];
                                return (
                                  packageIndex.get(`${product}:${inv}:${days}`) ??
                                  packageIndex.get(`${product}:${inv}:${code}`) ??
                                  null
                                );
                              })}
                              busy={busy}
                              lang={lang}
                              onSave={(changes) =>
                                void patchPackages(
                                  `${adminDeliveryAdProductHumanLabel(product, lang)} · ${deliveryAdCommercialPlacementLabel(inv, lang)}`,
                                  changes.map(({ pkg, body }) => ({
                                    label: `${pkg.durationDays}${lang === "en" ? "d" : "일"}`,
                                    body: {
                                      op: "update_package",
                                      packageId: pkg.id,
                                      reason: "admin_package_settings",
                                      ...body,
                                    },
                                  }))
                                )
                              }
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
              </div>
            </AdminCard>

            <AdminActionButton
              variant="secondary"
              className="!h-auto min-h-10 w-full !justify-between !whitespace-normal py-2 text-left"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((v) => !v)}
              data-commercial-advanced-toggle="1"
            >
              {safeT("admin_delivery_ads_commercial_advanced", {
                fallbackKo: "고급 설정 (상품·지면·Partner·연장)",
                fallbackEn: "Advanced (products · placements · Partner · extension)",
              })}
              <span aria-hidden>{advancedOpen ? "−" : "+"}</span>
            </AdminActionButton>

            {advancedOpen ? (
            <>
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

            <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-commercial-custom-package="1">
              <AdminActionButton
                variant="secondary"
                size="sm"
                aria-expanded={customOpen}
                onClick={() => setCustomOpen((v) => !v)}
              >
                {safeT("admin_delivery_ads_commercial_custom_package", {
                  fallbackKo: "맞춤 패키지 추가",
                  fallbackEn: "Add custom package",
                })}
              </AdminActionButton>
              {customOpen ? (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-2">
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

            {/* Extension collapsed */}
            <div
              className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
              data-commercial-extension-collapsed="1"
            >
              <AdminActionButton
                variant="secondary"
                size="sm"
                aria-expanded={extensionOpen}
                onClick={() => setExtensionOpen((v) => !v)}
              >
                {safeT("admin_delivery_ads_commercial_extension_collapsed", {
                  fallbackKo: "연장 정책 (고급)",
                  fallbackEn: "Extension policy (advanced)",
                })}
              </AdminActionButton>
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

            <div
              className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
              data-commercial-partner="r4-link"
            >
              <p className="text-[13px] text-sam-fg">
                {safeT("admin_delivery_ads_commercial_partner_note", {
                  fallbackKo:
                    "Partner 멤버십 설정·가입 관리는 Partner 페이지에서 통합 운영합니다. organic ranking과 분리.",
                  fallbackEn:
                    "Partner membership config and operations are unified on the Partner page. Separate from organic ranking.",
                })}
              </p>
              <Link
                href={DELIVERY_AD_ADMIN_ROUTES.partnerMemberships}
                className="mt-2 inline-flex text-[13px] font-semibold text-signature underline"
              >
                {safeT("admin_delivery_ads_partner_manage_link", {
                  fallbackKo: "Partner 관리 →",
                  fallbackEn: "Manage Partner →",
                })}
              </Link>
            </div>
            </>
            ) : null}
          </div>
        )}
      </div>
    </AdminDeliveryCmsChrome>
  );
}

type MatrixCellDraft = { price: string; enabled: boolean };

function matrixDraftOf(pkg: DeliveryAdPackageRow | null): MatrixCellDraft {
  return {
    price:
      pkg == null || isAdminDeliveryAdPriceUnset(pkg.priceAmountMinor)
        ? ""
        : (pkg.priceAmountMinor! / 100).toFixed(2),
    enabled: pkg?.enabled ?? false,
  };
}

/** 가격표 한 행 — 기간 칸 3개 입력 + 행당 [저장] 1개 (바뀐 칸만 저장). */
function MatrixRow(props: {
  label: string;
  pkgs: Array<DeliveryAdPackageRow | null>;
  busy: boolean;
  lang: "ko" | "en";
  onSave: (changes: Array<{ pkg: DeliveryAdPackageRow; body: Record<string, unknown> }>) => void;
}) {
  const { label, pkgs, busy, lang, onSave } = props;
  const [drafts, setDrafts] = useState<MatrixCellDraft[]>(() => pkgs.map(matrixDraftOf));
  const pkgKey = pkgs.map((p) => (p ? `${p.id}:${p.priceAmountMinor ?? ""}:${p.enabled}` : "-")).join("|");
  useEffect(() => {
    setDrafts(pkgs.map(matrixDraftOf));
    // pkgKey 가 바뀔 때(서버 카탈로그 갱신)만 입력값을 다시 맞춘다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkgKey]);

  const changes: Array<{ pkg: DeliveryAdPackageRow; body: Record<string, unknown> }> = [];
  let invalid = false;
  pkgs.forEach((pkg, i) => {
    const d = drafts[i];
    if (!pkg || !d) return;
    const base = matrixDraftOf(pkg);
    if (d.price.trim() === base.price.trim() && d.enabled === base.enabled) return;
    const priceAmountMinor = d.price.trim() === "" ? null : parseDeliveryAdPhpMajorToMinor(d.price);
    if (d.price.trim() !== "" && priceAmountMinor == null) {
      invalid = true;
      return;
    }
    changes.push({
      pkg,
      body: {
        displayName: pkg.displayName,
        durationDays: pkg.durationDays,
        priceAmountMinor,
        enabled: d.enabled,
      },
    });
  });

  return (
    <tr className="bg-sam-surface">
      <td className="border border-sam-border p-2 font-medium text-sam-fg">{label}</td>
      {pkgs.map((pkg, i) => (
        <td key={i} className="border border-sam-border p-2">
          <MatrixCell
            pkg={pkg}
            busy={busy}
            lang={lang}
            draft={drafts[i] ?? matrixDraftOf(pkg)}
            onChange={(patch) =>
              setDrafts((prev) => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)))
            }
          />
        </td>
      ))}
      <td className="border border-sam-border p-2 align-middle">
        <AdminActionButton
          variant="ghost"
          size="sm"
          disabled={busy || invalid || changes.length === 0}
          data-commercial-matrix-row-save="1"
          onClick={() => onSave(changes)}
        >
          {adminCta("save", lang !== "en")}
        </AdminActionButton>
      </td>
    </tr>
  );
}

function MatrixCell(props: {
  pkg: DeliveryAdPackageRow | null;
  busy: boolean;
  lang: "ko" | "en";
  draft: MatrixCellDraft;
  onChange: (patch: Partial<MatrixCellDraft>) => void;
}) {
  const { pkg, busy, lang, draft, onChange } = props;
  const unset =
    pkg == null || isAdminDeliveryAdPriceUnset(pkg.priceAmountMinor) || !pkg.enabled;
  const price = draft.price;
  const enabled = draft.enabled;
  if (!pkg) {
    return (
      <div
        className="space-y-1 rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-1.5 py-1.5"
        data-commercial-matrix-cell="missing"
      >
        <p className="text-[12px] font-bold text-sam-warning">
          {lang === "en" ? "Price unset" : "가격 미설정"}
        </p>
        <p className="text-[12px] text-sam-warning">
          {lang === "en" ? "Not for sale" : "판매 불가"}
        </p>
        <p className="text-[12px] leading-snug text-sam-fg">
          {lang === "en"
            ? "Set this price so Owners can apply."
            : "이 가격을 설정해야 Owner가 신청할 수 있습니다"}
        </p>
        <span className="sr-only">{formatAdminDeliveryAdPriceOrUnset(null, lang)}</span>
      </div>
    );
  }

  return (
    <div
      className={`space-y-1 ${
        unset ? "rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-1.5 py-1.5" : ""
      }`}
      data-commercial-matrix-cell={unset ? "unset" : "set"}
    >
      {unset ? (
        <div className="mb-1 space-y-0.5" data-commercial-price-unset-guide="1">
          <p className="text-[12px] font-bold text-sam-warning">
            {lang === "en" ? "Price unset" : "가격 미설정"}
          </p>
          <p className="text-[12px] text-sam-warning">
            {lang === "en" ? "Not for sale" : "판매 불가"}
          </p>
          <p className="text-[12px] leading-snug text-sam-fg">
            {lang === "en"
              ? "Set this price so Owners can apply."
              : "이 가격을 설정해야 Owner가 신청할 수 있습니다"}
          </p>
        </div>
      ) : null}
      <input
        className="w-full rounded-ui-rect border border-sam-border px-1.5 py-1 text-[12px]"
        placeholder={lang === "en" ? "PHP major" : "PHP 금액"}
        value={price}
        disabled={busy}
        onChange={(e) => onChange({ price: e.target.value })}
        data-price-null-safe="1"
      />
      <label className="flex items-center gap-1 text-[12px]">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
        {lang === "en" ? "Active" : "활성"}
      </label>
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
      <AdminActionButton
        variant="secondary"
        size="sm"
        disabled={props.busy}
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
        {adminCta("create", props.lang !== "en")}
      </AdminActionButton>
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
      <AdminActionButton
        variant="primary"
        disabled={props.busy}
        className="sm:col-span-4"
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
      </AdminActionButton>
    </div>
  );
}
