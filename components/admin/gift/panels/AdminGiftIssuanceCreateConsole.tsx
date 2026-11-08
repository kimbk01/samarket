"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";
import { GiftSalesDateTimeField } from "@/components/gift-certificate/GiftSalesDateTimeField";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { buildAdminGiftOpsHref } from "@/lib/gift-certificate/admin-gift-ops-tabs";
import {
  validateGiftProductFunding,
  type GiftDiscountFundingParty,
} from "@/lib/gift-certificate/gift-certificate-domain-contract";
import { Sam } from "@/lib/ui/css-vars";
import { useRouter } from "next/navigation";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";

export type IssuanceStoreHit = {
  storeId: string;
  storeName: string;
  ownerUserId: string;
  ownerLabel: string;
  approvalStatus: string;
  isVisible: boolean;
  businessType: string;
  categoryName: string;
};

type Props = {
  mode: "choose" | "STORE" | "PLATFORM";
  subTabs: React.ReactNode;
  onCreated: (product: {
    id: string;
    gift_scope?: "STORE" | "PLATFORM";
    store_id: string | null;
    store_name: string;
    title: string;
    face_value: number;
    purchase_price: number;
    platform_fee_rate: number;
    active: boolean;
    image_url?: string | null;
  }) => void;
};

function settlementPreview(face: number, feePct: number) {
  const gross = Math.max(0, Math.trunc(face));
  const fee = Math.max(0, Math.min(100, Math.trunc(feePct)));
  const dibay = Math.trunc((gross * fee) / 100);
  const merchant = Math.max(0, gross - dibay);
  return { gross, fee, dibay, merchant };
}

export function AdminGiftIssuanceCreateConsole({ mode, subTabs, onCreated }: Props) {
  const { safeT, language } = useI18n();
  const router = useRouter();
  const go = useCallback(
    (opts: { create?: string | null; type?: string | null }) => {
      router.push(
        buildAdminGiftOpsHref({
          tab: "products",
          products: "products",
          extra: {
            create: opts.create === undefined ? "1" : opts.create,
            type: opts.type ?? null,
          },
        })
      );
    },
    [router]
  );

  const [title, setTitle] = useState("");
  const [face, setFace] = useState("1000");
  const [price, setPrice] = useState("1000");
  const [fee, setFee] = useState("10");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [transferable, setTransferable] = useState(true);
  const [salesStart, setSalesStart] = useState("");
  const [salesEnd, setSalesEnd] = useState("");
  const [storeQuery, setStoreQuery] = useState("");
  const [storeHits, setStoreHits] = useState<IssuanceStoreHit[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [selected, setSelected] = useState<IssuanceStoreHit | null>(null);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discountFundingParty, setDiscountFundingParty] = useState<GiftDiscountFundingParty>("NONE");

  const faceN = Math.trunc(Number(face) || 0);
  const priceN = Math.trunc(Number(price) || 0);
  const feeN = Math.trunc(Number(fee) || 0);
  const promoGap = Math.max(0, faceN - priceN);
  const fundingUnits = useMemo(() => {
    if (promoGap <= 0) return { platformFundedUnits: 0, merchantFundedUnits: 0 };
    if (discountFundingParty === "PLATFORM") {
      return { platformFundedUnits: promoGap, merchantFundedUnits: 0 };
    }
    if (discountFundingParty === "MERCHANT") {
      return { platformFundedUnits: 0, merchantFundedUnits: promoGap };
    }
    if (discountFundingParty === "SHARED") {
      const half = Math.floor(promoGap / 2);
      return { platformFundedUnits: half, merchantFundedUnits: promoGap - half };
    }
    return { platformFundedUnits: 0, merchantFundedUnits: 0 };
  }, [promoGap, discountFundingParty]);
  const preview = useMemo(() => settlementPreview(faceN, feeN), [faceN, feeN]);

  useEffect(() => {
    if (promoGap <= 0) {
      if (discountFundingParty !== "NONE") setDiscountFundingParty("NONE");
      return;
    }
    if (discountFundingParty === "NONE") {
      setDiscountFundingParty(mode === "PLATFORM" ? "PLATFORM" : "MERCHANT");
    }
  }, [promoGap, mode, discountFundingParty]);

  const searchStores = useCallback(async (q: string) => {
    setStoreLoading(true);
    try {
      const qs = new URLSearchParams({ purpose: "issuance" });
      if (q.trim()) qs.set("q", q.trim());
      const res = await fetch(`/api/admin/gift-certificates/stores?${qs.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; stores?: IssuanceStoreHit[] };
      if (!res.ok || !json.ok) {
        setStoreHits([]);
        return;
      }
      setStoreHits(json.stores ?? []);
    } catch {
      setStoreHits([]);
    } finally {
      setStoreLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode !== "STORE") return;
    const t = window.setTimeout(() => void searchStores(storeQuery), 250);
    return () => window.clearTimeout(t);
  }, [mode, searchStores, storeQuery]);

  const uploadImage = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/admin/gift-certificates/upload-image", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !json.ok || !json.url) {
        setError(
          safeT("gift_ops_image_upload_fail")
        );
        return;
      }
      setImageUrl(json.url);
    } finally {
      setUploading(false);
    }
  };

  const canReview =
    title.trim().length > 0 &&
    faceN > 0 &&
    priceN >= 0 &&
    feeN >= 0 &&
    feeN <= 100 &&
    (mode === "PLATFORM" || Boolean(selected?.storeId)) &&
    validateGiftProductFunding({
      faceValue: faceN,
      purchasePrice: priceN,
      discountFundingParty: promoGap > 0 ? discountFundingParty : "NONE",
      platformFundedUnits: fundingUnits.platformFundedUnits,
      merchantFundedUnits: fundingUnits.merchantFundedUnits,
    }).ok;

  const startSale = async () => {
    if (busy || !canReview) return;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko: language !== "en",
      title: safeT("gift_admin_register_confirm_title"),
      description: safeT("gift_admin_register_confirm_body"),
      confirmLabel: adminCta("create", language !== "en"),
    });
    if (!confirmed.ok) return;

    setBusy(true);
    setError(null);
    try {
      const party = promoGap > 0 ? discountFundingParty : "NONE";
      const body: Record<string, unknown> = {
        giftScope: mode === "PLATFORM" ? "PLATFORM" : "STORE",
        title: title.trim(),
        faceValue: faceN,
        purchasePrice: priceN,
        platformFeeRate: feeN,
        discountFundingParty: party,
        platformFundedUnits: fundingUnits.platformFundedUnits,
        merchantFundedUnits: fundingUnits.merchantFundedUnits,
        transferable,
        imageUrl: imageUrl.trim() || null,
        salesStartsAt: salesStart ? new Date(salesStart).toISOString() : new Date().toISOString(),
        salesEndsAt: salesEnd ? new Date(salesEnd).toISOString() : null,
        active: false,
        draft: true,
      };
      if (mode === "STORE" && selected?.storeId) body.storeId = selected.storeId;
      const res = await fetch("/api/admin/gift-certificates/products", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        product?: {
          id: string;
          gift_scope?: "STORE" | "PLATFORM";
          store_id: string | null;
          title: string;
          face_value: number;
          purchase_price: number;
          platform_fee_rate: number;
          active: boolean;
          image_url?: string | null;
        };
      };
      if (!res.ok || !json.ok || !json.product) {
        setError(
          safeT("gift_ops_create_fail")
        );
        return;
      }
      await dibayAlert({
        title: safeT("gift_admin_product_success_title"),
        confirmLabel: adminCta("close", language !== "en"),
      });
      onCreated({
        ...json.product,
        store_name:
          mode === "PLATFORM"
            ? ""
            : selected?.storeName || "",
      });
    } finally {
      setBusy(false);
    }
  };

  if (mode === "choose") {
    return (
      <section className="space-y-4" data-admin-gift-create-choice="1">
        {subTabs}
        <h2 className="text-[16px] font-semibold text-sam-fg">
          {safeT("gift_ops_create_choose_prompt")}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="text-base font-semibold">
              {safeT("gift_ops_type_store")}
            </p>
            <p className="text-sm text-sam-muted">
              {safeT("gift_ops_type_store_desc")}
            </p>
            <AdminActionButton
              type="button"
              variant="primary" className="mt-auto w-full"
              onClick={() => go({ create: "1", type: "STORE" })}
            >
              {safeT("gift_ops_cta_make_store")}
            </AdminActionButton>
          </div>
          <div className="flex flex-col gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="text-base font-semibold">
              {safeT("gift_ops_type_platform")}
            </p>
            <p className="text-sm text-sam-muted">
              {safeT("gift_ops_type_platform_desc")}
            </p>
            <AdminActionButton
              type="button"
              variant="primary" className="mt-auto w-full"
              onClick={() => go({ create: "1", type: "PLATFORM" })}
            >
              {safeT("gift_ops_cta_make_platform")}
            </AdminActionButton>
          </div>
        </div>
        <AdminActionButton
          type="button"
          variant="secondary" className="w-full"
          onClick={() => go({ create: null, type: null })}
        >
          {safeT("gift_admin_cta_back")}
        </AdminActionButton>
      </section>
    );
  }

  const scopeLabel =
    mode === "PLATFORM"
      ? safeT("gift_ops_type_platform")
      : safeT("gift_ops_type_store");

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-[16px] font-semibold text-sam-fg">
          {mode === "PLATFORM"
            ? safeT("gift_ops_create_platform_title")
            : safeT("gift_ops_create_store_title")}
        </h2>
        <p className="mt-1 text-sm text-sam-muted">
          {mode === "PLATFORM"
            ? safeT("gift_ops_type_platform_desc")
            : safeT("gift_ops_type_store_desc")}
        </p>
      </div>
      <span className="rounded-full bg-sam-fg px-3 py-1 text-xs font-semibold text-sam-app">
        {scopeLabel}
      </span>
    </div>
  );

  const previewCard = (
    <aside className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4 lg:sticky lg:top-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-sam-muted">
        {safeT("gift_ops_preview_title")}
      </p>
      <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app">
        {imageUrl ? (
          // Thumbnail not used: remote admin upload URL preview
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-36 w-full object-cover" />
        ) : (
          <div className="flex h-36 items-center justify-center bg-sam-muted/20 text-xs text-sam-muted">
            {safeT("gift_ops_preview_no_image")}
          </div>
        )}
        <div className="space-y-1 p-3">
          <p className="text-[16px] font-bold tabular-nums">{formatAdminPhp(faceN || 0)}</p>
          <p className="text-sm font-semibold">{title.trim() || "—"}</p>
          <p className="text-xs text-sam-muted">
            {mode === "PLATFORM"
              ? safeT("gift_ops_usable_platform_short")
              : selected?.storeName ||
                safeT("gift_ops_select_store")}
          </p>
        </div>
      </div>
      <div className="space-y-1 text-sm">
        <p className="font-semibold">
          {safeT("gift_ops_settle_preview_title")}
        </p>
        <p className="text-xs text-sam-muted">
          {safeT("gift_ops_settle_preview_note")}
        </p>
        <p className="tabular-nums">
          {safeT("gift_ops_settle_use")}{" "}
          {formatAdminPhp(preview.gross)}
        </p>
        <p className="tabular-nums">
          DIBAY {preview.fee}% → {formatAdminPhp(preview.dibay)}
        </p>
        <p className="tabular-nums font-semibold">
          {safeT("gift_ops_settle_merchant")}{" "}
          {formatAdminPhp(preview.merchant)}
        </p>
        {mode === "PLATFORM" ? (
          <p className="text-xs text-sam-muted">
            {safeT("gift_ops_platform_settle_note")}
          </p>
        ) : null}
      </div>
    </aside>
  );

  if (review) {
    return (
      <section className="space-y-4" data-admin-gift-product-review="1">
        {subTabs}
        {header}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm">
            <p>
              <span className="text-sam-muted">
                {safeT("gift_ops_field_type")}:{" "}
              </span>
              {scopeLabel}
            </p>
            {mode === "STORE" ? (
              <p>
                <span className="text-sam-muted">
                  {safeT("gift_ops_usable_label")}:{" "}
                </span>
                {selected?.storeName}
              </p>
            ) : (
              <p>
                <span className="text-sam-muted">
                  {safeT("gift_ops_usable_label")}:{" "}
                </span>
                {safeT("gift_ops_usable_platform_short")}
              </p>
            )}
            <p className="font-semibold">{title}</p>
            <p className="tabular-nums">
              {safeT("gift_ops_field_face_amount")}{" "}
              {formatAdminPhp(faceN)} ·{" "}
              {safeT("gift_ops_field_purchase")}{" "}
              {formatAdminPhp(priceN)} · Fee {feeN}%
            </p>
            <p className="tabular-nums text-sam-muted">
              {safeT("gift_ops_settle_preview_title")}
              : {formatAdminPhp(preview.gross)} → DIBAY {formatAdminPhp(preview.dibay)} →{" "}
              {formatAdminPhp(preview.merchant)}
            </p>
            {error ? <p className="text-sm text-sam-danger">{error}</p> : null}
            <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse">
              <AdminActionButton
                type="button"
                variant="primary" className="flex-1"
                disabled={busy}
                data-admin-gift-create-start="1"
                onClick={() => void startSale()}
              >
                {mode === "PLATFORM"
                  ? safeT("gift_ops_cta_start_platform")
                  : safeT("gift_ops_cta_start_sale")}
              </AdminActionButton>
              <AdminActionButton
                type="button"
                variant="secondary" className="flex-1"
                onClick={() => setReview(false)}
              >
                {safeT("gift_ops_cta_edit")}
              </AdminActionButton>
            </div>
          </div>
          {previewCard}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4" data-admin-gift-product-create="1">
      {subTabs}
      {header}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          {mode === "STORE" ? (
            <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <h3 className="text-sm font-semibold">
                {safeT("gift_ops_sec_store")}
              </h3>
              <label className="block space-y-1 text-sm">
                <span>
                  {safeT("gift_ops_store_search")}
                </span>
                <input
                  className={Sam.input.base}
                  value={storeQuery}
                  onChange={(e) => setStoreQuery(e.target.value)}
                  placeholder={safeT("gift_ops_store_search_ph")}
                />
              </label>
              {storeLoading ? (
                <p className="text-xs text-sam-muted">{safeT("gift_ops_loading")}</p>
              ) : null}
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {storeHits.map((st) => (
                  <li key={st.storeId}>
                    <AdminChipButton
                      selected={selected?.storeId === st.storeId}
                      className="!h-auto w-full !flex-col !items-start !whitespace-normal !rounded-ui-rect !py-2 text-left"
                      onClick={() => setSelected(st)}
                    >
                      <span className="font-semibold">{st.storeName || st.storeId}</span>
                      <span className="mt-0.5 block text-xs text-sam-muted">
                        {st.ownerLabel || "—"} · {st.categoryName || st.businessType || "—"} ·{" "}
                        {st.approvalStatus || "—"}
                      </span>
                    </AdminChipButton>
                  </li>
                ))}
              </ul>
              {selected ? (
                <div className="rounded-ui-rect border border-sam-border bg-sam-app p-3 text-sm">
                  <p className="font-semibold">{selected.storeName}</p>
                  <p className="text-xs text-sam-muted">
                    Owner {selected.ownerLabel || "—"} · {selected.approvalStatus}
                  </p>
                  <p className="mt-2 text-xs">
                    {safeT("gift_ops_store_only_scope")}
                  </p>
                  <p className="mt-1 font-mono text-[12px] text-sam-muted">{selected.storeId}</p>
                </div>
              ) : null}
            </section>
          ) : (
            <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <h3 className="text-sm font-semibold">
                {safeT("gift_ops_sec_scope")}
              </h3>
              <p className="text-sm">
                {safeT("gift_ops_usable_platform_short")}
              </p>
              <p className="text-xs text-sam-muted">
                {safeT("gift_ops_platform_scope_note")}
              </p>
            </section>
          )}

          <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h3 className="text-sm font-semibold">
              {safeT("gift_ops_sec_basic")}
            </h3>
            <label className="block space-y-1 text-sm">
              <span>
                {safeT("gift_admin_field_title")}
              </span>
              <input
                className={Sam.input.base}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="₱1,000 식사 상품권"
              />
            </label>
            <div className="space-y-2 text-sm">
              <span>
                {safeT("gift_ops_field_image_upload")}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="block w-full text-sm"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadImage(f);
                }}
              />
              {uploading ? (
                <p className="text-xs text-sam-muted">
                  {safeT("gift_ops_uploading")}
                </p>
              ) : null}
            </div>
          </section>

          <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h3 className="text-sm font-semibold">
              {safeT("gift_ops_sec_amount")}
            </h3>
            <label className="block space-y-1 text-sm">
              <span>
                {safeT("gift_ops_field_face_amount")}
              </span>
              <input className={Sam.input.base} inputMode="numeric" value={face} onChange={(e) => setFace(e.target.value)} />
              <span className="text-xs text-sam-muted">
                {safeT("gift_ops_face_help")}
              </span>
            </label>
            <label className="block space-y-1 text-sm">
              <span>
                {safeT("gift_ops_field_purchase")}
              </span>
              <input className={Sam.input.base} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
              <span className="text-xs text-sam-muted">
                {safeT("gift_ops_purchase_help")}
              </span>
            </label>
            {promoGap > 0 ? (
              <label className="block space-y-1 text-sm">
                <span>
                  {safeT("gift_ops_field_promo_funding")}
                </span>
                <select
                  className={Sam.input.base}
                  value={discountFundingParty}
                  onChange={(e) =>
                    setDiscountFundingParty(e.target.value as GiftDiscountFundingParty)
                  }
                >
                  <option value="MERCHANT">
                    {safeT("gift_ops_funding_merchant")}
                  </option>
                  <option value="PLATFORM">
                    {safeT("gift_ops_funding_platform")}
                  </option>
                  <option value="SHARED">
                    {safeT("gift_ops_funding_shared")}
                  </option>
                </select>
                <span className="text-xs text-sam-muted tabular-nums">
                  {safeT("gift_ops_promo_gap_label", { vars: { gap: formatAdminPhp(promoGap) } })}
                </span>
              </label>
            ) : null}
          </section>

          <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h3 className="text-sm font-semibold">
              {safeT("gift_ops_sec_fee")}
            </h3>
            <label className="block space-y-1 text-sm">
              <span>
                {safeT("gift_ops_field_fee_dibay")}
              </span>
              <input className={Sam.input.base} inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} />
            </label>
          </section>

          <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h3 className="text-sm font-semibold">
              {safeT("gift_ops_sec_sales")}
            </h3>
            <GiftSalesDateTimeField
              label={safeT("gift_ops_field_sales_start")}
              value={salesStart}
              onChange={setSalesStart}
              allowEmpty={false}
              data-testid="create-start"
            />
            <GiftSalesDateTimeField
              label={safeT("gift_ops_field_sales_end")}
              value={salesEnd}
              onChange={setSalesEnd}
              data-testid="create-end"
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={transferable} onChange={(e) => setTransferable(e.target.checked)} />
              {safeT("gift_admin_field_transferable")}
            </label>
          </section>

          {error ? <p className="text-sm text-sam-danger">{error}</p> : null}

          <div className="sticky bottom-0 z-20 -mx-1 flex flex-col gap-2 border-t border-sam-border bg-sam-app/95 p-3 backdrop-blur-sm sm:flex-row-reverse">
            <AdminActionButton
              type="button"
              variant="primary" className="flex-1"
              disabled={!canReview}
              data-admin-gift-create-review="1"
              onClick={() => setReview(true)}
            >
              {safeT("gift_admin_cta_review_product")}
            </AdminActionButton>
            <AdminActionButton
              type="button"
              variant="secondary" className="flex-1"
              onClick={() => go({ create: "1", type: null })}
            >
              {safeT("gift_admin_cta_back")}
            </AdminActionButton>
          </div>
        </div>
        {previewCard}
      </div>
    </section>
  );
}
