"use client";

import {
  r5DeliveryStatusLabel,
  GIFT_APPLICATION_STATUS_NAMESPACE,
} from "@/lib/admin/status-labels/r5-delivery-status-labels";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import {
  buildAdminGiftOpsHref,
  type AdminGiftOpsProductsSubtab,
} from "@/lib/gift-certificate/admin-gift-ops-tabs";
import { resolveGiftProductFundingFromGap } from "@/lib/gift-certificate/gift-promo-economics";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { GiftSalesDateTimeField } from "@/components/gift-certificate/GiftSalesDateTimeField";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { AdminGiftIssuanceCreateConsole } from "@/components/admin/gift/panels/AdminGiftIssuanceCreateConsole";
import { AdminGiftProductDetailConsole } from "@/components/admin/gift/panels/AdminGiftProductDetailConsole";
import { Sam } from "@/lib/ui/css-vars";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { formatAdminShortIdEllipsis } from "@/components/admin/ui/AdminTechId";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";

type ApplicationRow = {
  id: string;
  store_id: string;
  store_name: string;
  owner_user_id: string;
  owner_label?: string;
  title: string;
  requested_face_value: number;
  requested_purchase_price: number | null;
  image_url: string | null;
  status: string;
  design_notes: string | null;
  rejection_reason: string | null;
  created_at: string;
};

type RedemptionByStore = {
  store_id: string;
  store_name: string;
  gross: number;
  fee: number;
  net: number;
};

type ProductRow = {
  id: string;
  gift_scope?: "STORE" | "PLATFORM";
  creation_source?: string | null;
  store_id: string | null;
  store_name: string;
  title: string;
  face_value: number;
  purchase_price: number;
  platform_fee_rate: number;
  sales_starts_at: string | null;
  sales_ends_at: string | null;
  active: boolean;
  archived_at?: string | null;
  mall_visible?: boolean;
  issued_count: number;
  max_issuance?: number | null;
  outstanding_balance: number;
  redeemed_gross: number;
  transferable?: boolean;
  image_url?: string | null;
  redemption_by_store?: RedemptionByStore[];
  updated_at?: string;
  customer_purchasable?: boolean;
  customer_purchase_reason?: string | null;
};

function dt(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    return formatAdminManilaDateTime(v);
  } catch {
    return v;
  }
}

function shortId(id: string): string {
  return id.length > 10 ? formatAdminShortIdEllipsis(id) : id;
}

function productOpsLabels(
  p: ProductRow,
  safeT: ReturnType<typeof useI18n>["safeT"]
): { sales: string; mall: string; window: string | null; customer: string } {
  const sales = p.archived_at
    ? safeT("gift_ops_status_archived")
    : p.active
      ? safeT("gift_ops_status_active")
      : safeT("gift_ops_status_paused");
  const mall =
    p.mall_visible === false
      ? safeT("gift_ops_mall_hidden_badge")
      : safeT("gift_ops_mall_visible_badge");
  let window: string | null = null;
  if (p.customer_purchase_reason === "before_sales_start") {
    window = safeT("gift_ops_sales_before_start");
  } else if (p.customer_purchase_reason === "after_sales_end") {
    window = safeT("gift_ops_sales_after_end");
  } else if (p.customer_purchase_reason === "issuance_cap_reached") {
    window = safeT("gift_ops_issuance_cap_reached");
  }
  const customer = p.customer_purchasable
    ? safeT("gift_ops_customer_purchasable")
    : safeT("gift_ops_customer_not_purchasable");
  return { sales, mall, window, customer };
}

export function AdminGiftIssuancePanel({
  productsSubtab,
  id,
  create,
  storeId,
  scopeFilter = "ALL",
  createType = "",
  pane = "",
}: {
  productsSubtab: AdminGiftOpsProductsSubtab;
  id: string;
  create: boolean;
  storeId: string;
  scopeFilter?: string;
  createType?: string;
  pane?: string;
}) {
  const { safeT, language } = useI18n();
  const labelScope = (scope: string | undefined) =>
    scope === "PLATFORM"
      ? safeT("gift_ops_type_platform")
      : safeT("gift_ops_type_store");
  const router = useRouter();
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [detail, setDetail] = useState<ApplicationRow | null>(null);
  const [listState, setListState] = useState<"loading" | "error" | "empty" | "data">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "PAUSED" | "ARCHIVED">("ALL");

  const [prodTitle, setProdTitle] = useState("");
  const [prodFace, setProdFace] = useState("");
  const [prodPrice, setProdPrice] = useState("");
  const [prodFee, setProdFee] = useState("0");
  const [prodImage, setProdImage] = useState("");
  const [prodTransferable, setProdTransferable] = useState(true);
  const [prodStart, setProdStart] = useState("");
  const [prodEnd, setProdEnd] = useState("");
  const [prodReview, setProdReview] = useState(false);
  const [prodSuccess, setProdSuccess] = useState<ProductRow | null>(null);
  const [chooseType, setChooseType] = useState(false);

  const directScope = createType === "PLATFORM" ? "PLATFORM" : createType === "STORE" ? "STORE" : null;
  const isDirectCreate = productsSubtab === "products" && create && !!directScope;

  const go = (args: Parameters<typeof buildAdminGiftOpsHref>[0]) => {
    router.push(buildAdminGiftOpsHref(args));
  };

  const loadApps = useCallback(async () => {
    setListState("loading");
    try {
      const res = await fetch("/api/admin/gift-certificates/applications", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; applications?: ApplicationRow[] };
      if (!res.ok || !json.ok) {
        setApps([]);
        setListState("error");
        return;
      }
      const rows = json.applications ?? [];
      setApps(rows);
      setListState(rows.length ? "data" : "empty");
    } catch {
      setApps([]);
      setListState("error");
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setListState("loading");
    try {
      const qs = new URLSearchParams();
      if (storeId) qs.set("storeId", storeId);
      if (scopeFilter === "STORE" || scopeFilter === "PLATFORM") qs.set("scope", scopeFilter);
      const res = await fetch(`/api/admin/gift-certificates/products?${qs.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; products?: ProductRow[] };
      if (!res.ok || !json.ok) {
        setProducts([]);
        setListState("error");
        return;
      }
      const rows = json.products ?? [];
      setProducts(rows);
      setListState(rows.length ? "data" : "empty");
    } catch {
      setProducts([]);
      setListState("error");
    }
  }, [id, scopeFilter, storeId]);

  const loadAppDetail = useCallback(
    async (appId: string) => {
      const res = await fetch(
        `/api/admin/gift-certificates/applications/${encodeURIComponent(appId)}`,
        { credentials: "include", cache: "no-store" }
      );
      const json = (await res.json()) as { ok?: boolean; application?: ApplicationRow };
      if (json.ok && json.application) {
        const app = json.application;
        setDetail(app);
        setProdTitle(app.title);
        setProdFace(String(app.requested_face_value));
        setProdPrice(
          app.requested_purchase_price != null
            ? String(app.requested_purchase_price)
            : String(app.requested_face_value)
        );
        setProdImage(app.image_url ?? "");
        setProdStart(new Date().toISOString().slice(0, 16));
        setProdEnd("");
        setError(null);
      } else {
        setDetail(null);
        setError(
          safeT("gift_ops_app_load_fail")
        );
      }
    },
    [safeT]
  );

  useEffect(() => {
    if (productsSubtab === "applications") void loadApps();
    else void loadProducts();
  }, [loadApps, loadProducts, productsSubtab]);

  useEffect(() => {
    if (productsSubtab === "applications" && id) void loadAppDetail(id);
    else if (productsSubtab === "applications") setDetail(null);
  }, [id, loadAppDetail, productsSubtab]);

  useEffect(() => {
    if (productsSubtab === "products" && create && !directScope) setChooseType(true);
    else setChooseType(false);
  }, [create, directScope, productsSubtab]);

  const selectedStoreName = detail?.store_name || "";

  const patchStatus = async (action: "under_review" | "rejected", reason?: string) => {
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/gift-certificates/applications/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, rejectionReason: reason }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        if (json.error === "status_changed") {
          setError(adminOperatorErrorMessage("status_changed", language !== "en"));
          await Promise.all([loadApps(), loadAppDetail(id)]);
          return;
        }
        setError(
          json.error === "rejection_reason_required"
            ? safeT("gift_admin_reject_reason_required")
            : safeT("gift_admin_action_fail")
        );
        return;
      }
      setRejectOpen(false);
      setRejectReason("");
      await Promise.all([loadApps(), loadAppDetail(id)]);
    } catch {
      setError(adminOperatorErrorMessage("network_error", language !== "en"));
    } finally {
      setBusy(false);
    }
  };

  const createProduct = async (opts: {
    giftScope: "STORE" | "PLATFORM";
    applicationId?: string;
    storeId?: string;
  }) => {
    if (busy) return;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko: language !== "en",
      title: safeT("gift_admin_register_confirm_title"),
      description: safeT("gift_admin_register_confirm_body"),
      confirmLabel: safeT("gift_admin_register_confirm_ok"),
    });
    if (!confirmed.ok) return;

    setBusy(true);
    setError(null);
    try {
      const salesStartsAt = prodStart ? new Date(prodStart).toISOString() : new Date().toISOString();
      const salesEndsAt = prodEnd ? new Date(prodEnd).toISOString() : null;
      const faceValue = Math.trunc(Number(prodFace));
      const purchasePrice = Math.trunc(Number(prodPrice));
      const promoGap = Math.max(0, faceValue - purchasePrice);
      const discountFundingParty =
        promoGap > 0 ? (opts.giftScope === "PLATFORM" ? "PLATFORM" : "MERCHANT") : "NONE";
      const fundingUnits = resolveGiftProductFundingFromGap({
        faceValue,
        purchasePrice,
        discountFundingParty,
      });
      const body: Record<string, unknown> = {
        giftScope: opts.giftScope,
        title: prodTitle.trim(),
        faceValue,
        purchasePrice,
        platformFeeRate: Math.trunc(Number(prodFee) || 0),
        discountFundingParty,
        platformFundedUnits: fundingUnits.dibayUnits,
        merchantFundedUnits: fundingUnits.ownerUnits,
        transferable: prodTransferable,
        imageUrl: prodImage.trim() || null,
        salesStartsAt,
        salesEndsAt,
        // Approve ≠ activate: always create inactive draft; sell via Product Detail.
        active: false,
        draft: true,
      };
      if (opts.applicationId) body.applicationId = opts.applicationId;
      if (opts.giftScope === "STORE" && opts.storeId) body.storeId = opts.storeId;

      const res = await fetch("/api/admin/gift-certificates/products", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; product?: ProductRow; error?: string };
      if (!res.ok || !json.ok || !json.product) {
        setError(
          safeT("gift_admin_product_fail")
        );
        return;
      }
      const createdId = String(json.product.id);
      if (opts.applicationId) {
        await dibayAlert({
          title: safeT("gift_admin_draft_created_title"),
          description: safeT("gift_admin_draft_created_body"),
          confirmLabel: safeT("gift_admin_draft_created_ok"),
        });
        go({ tab: "products", products: "products", extra: { id: createdId } });
        return;
      }
      await dibayAlert({
        title: safeT("gift_admin_product_success_title"),
        confirmLabel: safeT("gift_admin_draft_created_ok"),
      });
      go({ tab: "products", products: "products", extra: { id: createdId } });
      return;
    } finally {
      setBusy(false);
    }
  };

  const subTabs = (
    <div className="flex flex-wrap gap-2">
      <Link
        href={buildAdminGiftOpsHref({ tab: "products", products: "applications" })}
        className={[
          "rounded-ui-rect px-3 py-1.5 text-xs font-semibold",
          productsSubtab === "applications"
            ? "bg-sam-fg text-sam-app"
            : "border border-sam-border bg-sam-surface",
        ].join(" ")}
      >
        {safeT("gift_ops_sub_applications")}
      </Link>
      <Link
        href={buildAdminGiftOpsHref({ tab: "products", products: "products" })}
        className={[
          "rounded-ui-rect px-3 py-1.5 text-xs font-semibold",
          productsSubtab === "products"
            ? "bg-sam-fg text-sam-app"
            : "border border-sam-border bg-sam-surface",
        ].join(" ")}
      >
        {safeT("gift_ops_sub_products")}
      </Link>
    </div>
  );

  const productInstanceNote = (
    <p className="text-xs text-sam-muted">
      {safeT("gift_ops_product_vs_instance")}
    </p>
  );

  const formFields = (
    <>
      <label className="block space-y-1 text-sm">
        <span>{safeT("gift_admin_field_title")}</span>
        <input className={Sam.input.base} value={prodTitle} onChange={(e) => setProdTitle(e.target.value)} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>
          {safeT("gift_ops_field_face_amount")}
        </span>
        <input className={Sam.input.base} inputMode="numeric" value={prodFace} onChange={(e) => setProdFace(e.target.value)} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{safeT("gift_ops_field_purchase")}</span>
        <input className={Sam.input.base} inputMode="numeric" value={prodPrice} onChange={(e) => setProdPrice(e.target.value)} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>
          {safeT("gift_ops_field_fee_dibay")}
        </span>
        <input className={Sam.input.base} inputMode="numeric" value={prodFee} onChange={(e) => setProdFee(e.target.value)} />
      </label>
      <GiftSalesDateTimeField
        label={safeT("gift_ops_field_sales_start")}
        value={prodStart}
        onChange={setProdStart}
        allowEmpty={false}
        data-testid="app-create-start"
      />
      <GiftSalesDateTimeField
        label={safeT("gift_ops_field_sales_end")}
        value={prodEnd}
        onChange={setProdEnd}
        data-testid="app-create-end"
      />
      <label className="block space-y-1 text-sm">
        <span>
          {safeT("gift_ops_field_image_upload")}
        </span>
        <input className={Sam.input.base} value={prodImage} onChange={(e) => setProdImage(e.target.value)} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={prodTransferable} onChange={(e) => setProdTransferable(e.target.checked)} />
        {safeT("gift_admin_field_transferable")}
      </label>
    </>
  );

  if (prodSuccess) {
    return (
      <section className="space-y-4" data-admin-gift-issuance-success="1">
        {subTabs}
        <h2 className="text-[16px] font-semibold">
          {safeT("gift_admin_product_success_title")}
        </h2>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm space-y-1">
          <p>
            {safeT("gift_ops_field_type")}:{" "}
            {labelScope(prodSuccess.gift_scope)}
          </p>
          <p>
            {safeT("gift_ops_field_store")}:{" "}
            {prodSuccess.gift_scope === "PLATFORM"
              ? safeT("gift_ops_store_all_dibay")
              : prodSuccess.store_name || "—"}
          </p>
          <p className="font-semibold">{prodSuccess.title}</p>
          <p className="tabular-nums">
            Face {formatAdminPhp(prodSuccess.face_value)} · Fee {prodSuccess.platform_fee_rate}%
          </p>
        </div>
        <AdminActionButton
          type="button"
          variant="primary" className="w-full"
          onClick={() =>
            go({
              tab: "products",
              extra: { id: prodSuccess.id },
            })
          }
        >
          {safeT("gift_ops_cta_detail")}
        </AdminActionButton>
      </section>
    );
  }

  if (chooseType) {
    return (
      <AdminGiftIssuanceCreateConsole
        mode="choose"
        subTabs={subTabs}
        onCreated={() => {
          /* choose mode never creates */
        }}
      />
    );
  }

  if (isDirectCreate && directScope) {
    return (
      <AdminGiftIssuanceCreateConsole
        mode={directScope}
        subTabs={subTabs}
        onCreated={(product) => {
          setProdSuccess({
            id: product.id,
            gift_scope: product.gift_scope,
            store_id: product.store_id,
            store_name: product.store_name,
            title: product.title,
            face_value: product.face_value,
            purchase_price: product.purchase_price,
            platform_fee_rate: product.platform_fee_rate,
            sales_starts_at: null,
            sales_ends_at: null,
            active: product.active,
            issued_count: 0,
            outstanding_balance: 0,
            redeemed_gross: 0,
            image_url: product.image_url,
          });
          void loadProducts();
        }}
      />
    );
  }

  /* Application-driven create (preserved) */
  if (productsSubtab === "applications" && id && create && detail) {
    if (prodReview) {
      const face = Math.trunc(Number(prodFace) || 0);
      const price = Math.trunc(Number(prodPrice) || 0);
      return (
        <section className="space-y-4" data-admin-gift-product-review="1">
          {subTabs}
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm space-y-1">
            <p>
              {safeT("gift_ops_field_type")}:{" "}
              {labelScope("STORE")}
            </p>
            <p>
              {safeT("gift_ops_field_store")}:{" "}
              {detail.store_name}
            </p>
            <p className="font-semibold">{prodTitle}</p>
            <p className="tabular-nums">
              Face {formatAdminPhp(face)} · Purchase {formatAdminPhp(price)} · Fee{" "}
              {Math.trunc(Number(prodFee) || 0)}%
            </p>
          </div>
          {error ? <p className="text-sm text-sam-danger">{error}</p> : null}
          <div className="sticky bottom-0 z-20 -mx-1 flex flex-col gap-2 border-t border-sam-border bg-sam-app/95 p-3 backdrop-blur-sm">
            <AdminActionButton
              type="button"
              variant="primary" className="w-full"
              disabled={busy}
              data-admin-gift-app-start="1"
              onClick={() =>
                void createProduct({
                  giftScope: "STORE",
                  applicationId: detail.id,
                  storeId: detail.store_id,
                })
              }
            >
              {safeT("gift_ops_cta_start_sale")}
            </AdminActionButton>
            <AdminActionButton
              type="button"
              variant="secondary" className="w-full"
              onClick={() => setProdReview(false)}
            >
              {safeT("gift_admin_cta_back")}
            </AdminActionButton>
          </div>
        </section>
      );
    }
    const face = Math.trunc(Number(prodFace) || 0);
    const price = Math.trunc(Number(prodPrice) || 0);
    return (
      <section className="space-y-4" data-admin-gift-product-create="1">
        {subTabs}
        <h2 className="text-[16px] font-semibold">
          {safeT("gift_admin_product_create_title")}
        </h2>
        <p className="text-sm text-sam-muted">
          {detail.store_name} · {detail.owner_label || shortId(detail.owner_user_id)}
        </p>
        {formFields}
        {error ? <p className="text-sm text-sam-danger">{error}</p> : null}
        <div className="sticky bottom-0 z-20 -mx-1 flex flex-col gap-2 border-t border-sam-border bg-sam-app/95 p-3 backdrop-blur-sm">
          <AdminActionButton
            type="button"
            variant="primary" className="w-full"
            disabled={!prodTitle.trim() || face <= 0 || price < 0}
            data-admin-gift-app-review="1"
            onClick={() => setProdReview(true)}
          >
            {safeT("gift_admin_cta_review_product")}
          </AdminActionButton>
          <AdminActionButton
            type="button"
            variant="secondary" className="w-full"
            onClick={() => go({ tab: "products", products: "applications", extra: { id } })}
          >
            {safeT("gift_admin_cta_back")}
          </AdminActionButton>
        </div>
      </section>
    );
  }

  if (productsSubtab === "applications" && id && detail) {
    return (
      <section className="space-y-4" data-admin-gift-application-detail="1">
        {subTabs}
        <h2 className="text-[16px] font-semibold">
          {safeT("gift_admin_detail_title")}
        </h2>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm space-y-1">
          <p className="font-semibold">{detail.title}</p>
          <p>
            {safeT("gift_ops_field_store")}:{" "}
            {detail.store_name || "—"}
          </p>
          <p>
            {safeT("gift_ops_field_owner")}:{" "}
            {detail.owner_label || shortId(detail.owner_user_id)}
          </p>
          <p className="tabular-nums">Face {formatAdminPhp(detail.requested_face_value)}</p>
          <p>{r5DeliveryStatusLabel(GIFT_APPLICATION_STATUS_NAMESPACE, detail.status, language !== "en")}</p>
          <p className="text-xs text-sam-muted">{dt(detail.created_at)}</p>
        </div>
        {error ? <p className="text-sm text-sam-danger">{error}</p> : null}
        {detail.status === "submitted" ||
        detail.status === "under_review" ||
        detail.status === "approved" ? (
          <AdminActionButton
            type="button"
            variant="primary" className="w-full"
            onClick={() =>
              go({ tab: "products", products: "applications", extra: { id, create: "1" } })
            }
          >
            {safeT("gift_admin_cta_approve_create")}
          </AdminActionButton>
        ) : null}
        {detail.status === "submitted" || detail.status === "under_review" ? (
          <>
            <AdminActionButton
              type="button"
              variant="secondary" className="w-full"
              disabled={busy}
              onClick={() => void patchStatus("under_review")}
            >
              {safeT("gift_admin_cta_mark_review")}
            </AdminActionButton>
            <AdminActionButton
              variant="secondary"
              className="w-full"
              onClick={() => setRejectOpen(true)}
            >
              {safeT("gift_admin_cta_reject")}
            </AdminActionButton>
          </>
        ) : null}
        {rejectOpen ? (
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <textarea
              className="min-h-[88px] w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <AdminActionButton
              variant="danger"
              className="mt-3 w-full"
              disabled={busy || !rejectReason.trim()}
              onClick={() => void patchStatus("rejected", rejectReason.trim())}
            >
              {safeT("gift_admin_cta_reject_confirm")}
            </AdminActionButton>
          </div>
        ) : null}
        <AdminActionButton
          type="button"
          variant="secondary" className="w-full"
          onClick={() => go({ tab: "products", products: "applications" })}
        >
          {safeT("gift_admin_cta_back_list")}
        </AdminActionButton>
      </section>
    );
  }

  if (productsSubtab === "products" && id) {
    return (
      <section className="space-y-4">
        {subTabs}
        {productInstanceNote}
        <AdminGiftProductDetailConsole
          productId={id}
          pane={pane}
          onBack={() => go({ tab: "products", products: "products" })}
          onChanged={() => void loadProducts()}
        />
      </section>
    );
  }

  const filteredProducts = products.filter((p) => {
    const st = p.archived_at ? "ARCHIVED" : p.active ? "ACTIVE" : "PAUSED";
    if (statusFilter !== "ALL" && st !== statusFilter) return false;
    const q = productSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      p.title.toLowerCase().includes(q) ||
      (p.store_name || "").toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    );
  });

  return (
    <section className="space-y-4" data-admin-gift-issuance-panel="1">
      {subTabs}
      {productInstanceNote}

      {productsSubtab === "applications" ? (
        <p className="text-xs text-sam-muted">
          {safeT("gift_ops_applications_note")}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <AdminActionButton
            type="button"
            variant="primary"
            onClick={() => go({ tab: "products", products: "products", extra: { create: "1" } })}
          >
            {safeT("gift_ops_cta_new_product")}
          </AdminActionButton>
          {(["ALL", "STORE", "PLATFORM"] as const).map((sc) => (
            <Link
              key={sc}
              href={buildAdminGiftOpsHref({
                tab: "products",
                products: "products",
                extra: { scope: sc === "ALL" ? null : sc, storeId: storeId || null },
              })}
              className={[
                "rounded-ui-rect px-3 py-1.5 text-xs font-semibold",
                (scopeFilter || "ALL") === sc
                  ? "bg-sam-fg text-sam-app"
                  : "border border-sam-border bg-sam-surface",
              ].join(" ")}
            >
              {sc === "ALL"
                ? safeT("gift_ops_range_all")
                : sc === "STORE"
                  ? safeT("gift_ops_type_store")
                  : safeT("gift_ops_type_platform")}
            </Link>
          ))}
          <input
            className={`${Sam.input.base} min-h-[40px] min-w-[140px] flex-1 text-sm`}
            placeholder={safeT("gift_ops_product_search_ph")}
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            data-admin-gift-product-search="1"
          />
          {(["ALL", "ACTIVE", "PAUSED", "ARCHIVED"] as const).map((st) => (
            <AdminChipButton
              key={st}
              data-admin-gift-product-status={st}
              selected={statusFilter === st}
              onClick={() => setStatusFilter(st)}
            >
              {st === "ALL"
                ? safeT("gift_ops_status_all")
                : st === "ACTIVE"
                  ? safeT("gift_ops_status_active")
                  : st === "PAUSED"
                    ? safeT("gift_ops_status_paused")
                    : safeT("gift_ops_status_archived")}
            </AdminChipButton>
          ))}
        </div>
      )}

      {listState === "loading" ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_ops_loading")}
        </p>
      ) : null}

      {listState === "error" ? (
        <div className="space-y-2">
          <p className="text-sm text-sam-danger">
            {safeT("gift_ops_list_error")}
          </p>
          <AdminActionButton
            type="button"
            variant="secondary"
            onClick={() => void (productsSubtab === "applications" ? loadApps() : loadProducts())}
          >
            {adminCta("refresh", language !== "en")}
          </AdminActionButton>
        </div>
      ) : null}

      {listState === "empty" ? (
        <p className="text-sm text-sam-muted">
          {productsSubtab === "applications"
            ? safeT("gift_admin_empty_apps")
            : safeT("gift_admin_empty_products")}
        </p>
      ) : null}

      {listState === "data" && productsSubtab === "applications" ? (
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-sam-border text-xs text-sam-muted">
                <th className="px-2 py-2">Store</th>
                <th className="px-2 py-2">Owner</th>
                <th className="px-2 py-2">Title</th>
                <th className="px-2 py-2">Face</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {apps.map((r) => (
                <tr key={r.id} className="border-b border-sam-border/60">
                  <td className="px-2 py-2">{r.store_name || "—"}</td>
                  <td className="px-2 py-2">{r.owner_label || shortId(r.owner_user_id)}</td>
                  <td className="px-2 py-2 font-semibold">{r.title}</td>
                  <td className="px-2 py-2 tabular-nums">{formatAdminPhp(r.requested_face_value)}</td>
                  <td className="px-2 py-2">{r5DeliveryStatusLabel(GIFT_APPLICATION_STATUS_NAMESPACE, r.status, language !== "en")}</td>
                  <td className="px-2 py-2">
                    <AdminActionButton
                      type="button"
                      variant="ghost" size="sm"
                      onClick={() =>
                        go({ tab: "products", products: "applications", extra: { id: r.id } })
                      }
                    >
                      {safeT("gift_admin_cta_review")}
                    </AdminActionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {listState === "data" && productsSubtab === "products" ? (
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-sam-border text-xs text-sam-muted">
                <th className="px-2 py-2">{safeT("gift_ops_col_image")}</th>
                <th className="px-2 py-2">{safeT("gift_admin_field_title")}</th>
                <th className="px-2 py-2">{safeT("gift_ops_field_store")}</th>
                <th className="px-2 py-2">{safeT("gift_ops_field_face_amount")}</th>
                <th className="px-2 py-2">{safeT("gift_ops_field_purchase")}</th>
                <th className="px-2 py-2">{safeT("gift_ops_field_fee_dibay")}</th>
                <th className="px-2 py-2">{safeT("gift_ops_field_sales_window")}</th>
                <th className="px-2 py-2">{safeT("gift_ops_col_ops_state")}</th>
                <th className="px-2 py-2">{safeT("gift_ops_col_customer_state")}</th>
                <th className="px-2 py-2">{safeT("gift_ops_kpi_issued")}</th>
                <th className="px-2 py-2">{safeT("gift_ops_kpi_outstanding")}</th>
                <th className="px-2 py-2">{safeT("gift_ops_col_updated")}</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p) => {
                const sc = p.gift_scope === "PLATFORM" ? "PLATFORM" : "STORE";
                const ops = productOpsLabels(p, safeT);
                return (
                  <tr
                    key={p.id}
                    className="border-b border-sam-border/60"
                    data-admin-gift-product-row={p.id}
                  >
                    <td className="px-2 py-2">
                      <div className="relative h-10 w-10 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app">
                        {p.image_url ? (
                          <SamarketThumbnail src={p.image_url} alt="" fill className="relative h-full w-full" imageClassName="object-cover" />
                        ) : (
                          <span className="flex h-full items-center justify-center text-[12px] text-sam-muted">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 font-semibold">{p.title}</td>
                    <td className="px-2 py-2">
                      {sc === "PLATFORM"
                        ? safeT("gift_ops_store_all_dibay")
                        : p.store_name || "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{formatAdminPhp(p.face_value)}</td>
                    <td className="px-2 py-2 tabular-nums">{formatAdminPhp(p.purchase_price)}</td>
                    <td className="px-2 py-2">{p.platform_fee_rate}%</td>
                    <td className="px-2 py-2 text-xs">
                      {dt(p.sales_starts_at)} → {dt(p.sales_ends_at)}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-col gap-0.5 text-xs" data-admin-gift-product-ops-state="1">
                        <span>{ops.sales}</span>
                        <span className={p.mall_visible === false ? "text-sam-warning" : "text-sam-muted"}>
                          {ops.mall}
                        </span>
                        {ops.window ? <span className="text-sam-warning">{ops.window}</span> : null}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={[
                          "text-xs font-semibold",
                          p.customer_purchasable ? "text-sam-success" : "text-sam-muted",
                        ].join(" ")}
                        data-admin-gift-customer-purchasable={p.customer_purchasable ? "1" : "0"}
                        data-admin-gift-customer-reason={p.customer_purchase_reason || ""}
                      >
                        {ops.customer}
                      </span>
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {p.issued_count}
                      {p.max_issuance != null ? ` / ${p.max_issuance}` : ""}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{formatAdminPhp(p.outstanding_balance)}</td>
                    <td className="px-2 py-2 text-xs">{dt(p.updated_at || null)}</td>
                    <td className="px-2 py-2">
                      <AdminActionButton
                        type="button"
                        variant="ghost" size="sm"
                        data-admin-gift-product-open-detail="1"
                        onClick={() => go({ tab: "products", extra: { id: p.id } })}
                      >
                        {safeT("gift_ops_cta_detail")}
                      </AdminActionButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {listState === "data" && productsSubtab === "products" ? (
        <ul className="space-y-2 md:hidden">
          {filteredProducts.map((p) => {
            const sc = p.gift_scope === "PLATFORM" ? "PLATFORM" : "STORE";
            const ops = productOpsLabels(p, safeT);
            return (
              <li
                key={p.id}
                className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
                data-admin-gift-product-row={p.id}
              >
                <div className="flex gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app">
                    {p.image_url ? (
                      <SamarketThumbnail src={p.image_url} alt="" fill className="relative h-full w-full" imageClassName="object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-sam-muted">{labelScope(sc)}</p>
                    <p className="font-semibold">{p.title}</p>
                    <p className="text-xs tabular-nums">
                      {formatAdminPhp(p.face_value)} · {ops.sales} · {ops.mall}
                    </p>
                    <p
                      className="text-xs font-semibold"
                      data-admin-gift-customer-purchasable={p.customer_purchasable ? "1" : "0"}
                      data-admin-gift-customer-reason={p.customer_purchase_reason || ""}
                    >
                      {ops.customer}
                      {ops.window ? ` · ${ops.window}` : ""}
                    </p>
                  </div>
                </div>
                <AdminActionButton
                  type="button"
                  variant="ghost" size="sm" className="mt-3 w-full"
                  data-admin-gift-product-open-detail="1"
                  onClick={() => go({ tab: "products", extra: { id: p.id } })}
                >
                  {safeT("gift_ops_cta_detail")}
                </AdminActionButton>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
