"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  buildAdminGiftOpsHref,
  type AdminGiftOpsProductsSubtab,
} from "@/lib/gift-certificate/admin-gift-ops-tabs";
import { formatMoneyPhp } from "@/lib/utils/format";
import { Sam } from "@/lib/ui/css-vars";
import { AdminGiftIssuanceCreateConsole } from "@/components/admin/gift/panels/AdminGiftIssuanceCreateConsole";

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
  issued_count: number;
  outstanding_balance: number;
  redeemed_gross: number;
  transferable?: boolean;
  image_url?: string | null;
  redemption_by_store?: RedemptionByStore[];
};

function dt(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

export function AdminGiftIssuancePanel({
  productsSubtab,
  id,
  create,
  storeId,
  scopeFilter = "ALL",
  createType = "",
}: {
  productsSubtab: AdminGiftOpsProductsSubtab;
  id: string;
  create: boolean;
  storeId: string;
  scopeFilter?: string;
  createType?: string;
}) {
  const { safeT } = useI18n();
  const labelScope = (scope: string | undefined) =>
    scope === "PLATFORM"
      ? safeT("gift_ops_type_platform", { fallbackKo: "DIBAY 상품권", fallbackEn: "DIBAY Gift" })
      : safeT("gift_ops_type_store", { fallbackKo: "매장 상품권", fallbackEn: "Store Gift" });
  const router = useRouter();
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [detail, setDetail] = useState<ApplicationRow | null>(null);
  const [productDetail, setProductDetail] = useState<ProductRow | null>(null);
  const [listState, setListState] = useState<"loading" | "error" | "empty" | "data">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

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
      if (id) setProductDetail(rows.find((p) => p.id === id) ?? null);
      else setProductDetail(null);
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
          safeT("gift_ops_app_load_fail", {
            fallbackKo: "신청을 불러오지 못했습니다.",
            fallbackEn: "Couldn’t load application.",
          })
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
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(
          json.error === "rejection_reason_required"
            ? safeT("gift_admin_reject_reason_required", {
                fallbackKo: "반려 사유를 입력해 주세요.",
                fallbackEn: "Rejection reason is required.",
              })
            : safeT("gift_admin_action_fail", {
                fallbackKo: "처리에 실패했습니다.",
                fallbackEn: "Action failed.",
              })
        );
        return;
      }
      setRejectOpen(false);
      setRejectReason("");
      await Promise.all([loadApps(), loadAppDetail(id)]);
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
    setBusy(true);
    setError(null);
    try {
      const salesStartsAt = prodStart ? new Date(prodStart).toISOString() : new Date().toISOString();
      const salesEndsAt = prodEnd ? new Date(prodEnd).toISOString() : null;
      const body: Record<string, unknown> = {
        giftScope: opts.giftScope,
        title: prodTitle.trim(),
        faceValue: Math.trunc(Number(prodFace)),
        purchasePrice: Math.trunc(Number(prodPrice)),
        platformFeeRate: Math.trunc(Number(prodFee) || 0),
        discountFundingParty: "NONE",
        platformFundedUnits: 0,
        merchantFundedUnits: 0,
        transferable: prodTransferable,
        imageUrl: prodImage.trim() || null,
        salesStartsAt,
        salesEndsAt,
        active: true,
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
          safeT("gift_admin_product_fail", {
            fallbackKo: "상품권 상품을 만들지 못했습니다.",
            fallbackEn: "Could not create gift product.",
          })
        );
        return;
      }
      setProdSuccess({
        ...json.product,
        gift_scope: opts.giftScope,
        store_name:
          opts.giftScope === "PLATFORM"
            ? ""
            : selectedStoreName || detail?.store_name || json.product.store_name || "",
        outstanding_balance: 0,
        redeemed_gross: 0,
        issued_count: Math.trunc(Number(json.product.issued_count) || 0),
        platform_fee_rate: Math.trunc(Number(json.product.platform_fee_rate) || Number(prodFee) || 0),
      });
      if (opts.applicationId) await loadApps();
      else await loadProducts();
    } finally {
      setBusy(false);
    }
  };

  const patchProduct = async (action: string) => {
    if (!productDetail || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/gift-certificates/products/${encodeURIComponent(productDetail.id)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      const json = (await res.json()) as { ok?: boolean; product?: ProductRow; error?: string };
      if (!res.ok || !json.ok) {
        setError(
          safeT("gift_admin_action_fail", {
            fallbackKo: "처리에 실패했습니다.",
            fallbackEn: "Action failed.",
          })
        );
        return;
      }
      await loadProducts();
    } finally {
      setBusy(false);
    }
  };

  const deleteProduct = async () => {
    if (!productDetail || busy) return;
    if (productDetail.issued_count > 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/gift-certificates/products/${encodeURIComponent(productDetail.id)}`,
        { method: "DELETE", credentials: "include" }
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(
          json.error === "delete_forbidden_has_instances"
            ? safeT("gift_ops_delete_forbidden", {
                fallbackKo: "발급된 Instance가 있어 삭제할 수 없습니다. 판매중지/보관을 사용하세요.",
                fallbackEn: "Cannot delete: instances exist. Pause or archive instead.",
              })
            : safeT("gift_admin_action_fail", {
                fallbackKo: "처리에 실패했습니다.",
                fallbackEn: "Action failed.",
              })
        );
        return;
      }
      go({ tab: "products", products: "products" });
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
        {safeT("gift_ops_sub_applications", {
          fallbackKo: "매장 오너 판매 신청",
          fallbackEn: "Owner sale applications",
        })}
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
        {safeT("gift_ops_sub_products", {
          fallbackKo: "상품권 상품",
          fallbackEn: "Gift products",
        })}
      </Link>
    </div>
  );

  const productInstanceNote = (
    <p className="text-xs text-sam-muted">
      {safeT("gift_ops_product_vs_instance", {
        fallbackKo:
          "PRODUCT는 판매 템플릿입니다. INSTANCE는 고객이 구매한 개별 상품권(Public Gift Number)입니다.",
        fallbackEn:
          "PRODUCT is the sellable template. INSTANCE is one purchased gift certificate (Public Gift Number).",
      })}
    </p>
  );

  const formFields = (
    <>
      <label className="block space-y-1 text-sm">
        <span>{safeT("gift_admin_field_title", { fallbackKo: "상품명", fallbackEn: "Title" })}</span>
        <input className={Sam.input.base} value={prodTitle} onChange={(e) => setProdTitle(e.target.value)} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>
          {safeT("gift_ops_field_face_amount", { fallbackKo: "표시 금액", fallbackEn: "Display amount" })}
        </span>
        <input className={Sam.input.base} inputMode="numeric" value={prodFace} onChange={(e) => setProdFace(e.target.value)} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{safeT("gift_ops_field_purchase", { fallbackKo: "판매가", fallbackEn: "Purchase price" })}</span>
        <input className={Sam.input.base} inputMode="numeric" value={prodPrice} onChange={(e) => setProdPrice(e.target.value)} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>
          {safeT("gift_ops_field_fee_dibay", { fallbackKo: "DIBAY 수수료 %", fallbackEn: "DIBAY fee %" })}
        </span>
        <input className={Sam.input.base} inputMode="numeric" value={prodFee} onChange={(e) => setProdFee(e.target.value)} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{safeT("gift_ops_field_sales_start", { fallbackKo: "판매 시작", fallbackEn: "Sales start" })}</span>
        <input className={Sam.input.base} type="datetime-local" value={prodStart} onChange={(e) => setProdStart(e.target.value)} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{safeT("gift_ops_field_sales_end", { fallbackKo: "판매 종료", fallbackEn: "Sales end" })}</span>
        <input className={Sam.input.base} type="datetime-local" value={prodEnd} onChange={(e) => setProdEnd(e.target.value)} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>
          {safeT("gift_ops_field_image_upload", { fallbackKo: "상품권 이미지 URL", fallbackEn: "Gift image URL" })}
        </span>
        <input className={Sam.input.base} value={prodImage} onChange={(e) => setProdImage(e.target.value)} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={prodTransferable} onChange={(e) => setProdTransferable(e.target.checked)} />
        {safeT("gift_admin_field_transferable", { fallbackKo: "선물 가능", fallbackEn: "Transferable" })}
      </label>
    </>
  );

  if (prodSuccess) {
    return (
      <section className="space-y-4" data-admin-gift-issuance-success="1">
        {subTabs}
        <h2 className="text-lg font-semibold">
          {safeT("gift_admin_product_success_title", {
            fallbackKo: "상품권이 판매 등록되었습니다.",
            fallbackEn: "Gift product is now on sale.",
          })}
        </h2>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm space-y-1">
          <p>
            {safeT("gift_ops_field_type", { fallbackKo: "상품권 종류", fallbackEn: "Gift type" })}:{" "}
            {labelScope(prodSuccess.gift_scope)}
          </p>
          <p>
            {safeT("gift_ops_field_store", { fallbackKo: "매장", fallbackEn: "Store" })}:{" "}
            {prodSuccess.gift_scope === "PLATFORM"
              ? safeT("gift_ops_store_all_dibay", { fallbackKo: "DIBAY 전체", fallbackEn: "All DIBAY" })
              : prodSuccess.store_name || "—"}
          </p>
          <p className="font-semibold">{prodSuccess.title}</p>
          <p className="tabular-nums">
            Face {formatMoneyPhp(prodSuccess.face_value)} · Fee {prodSuccess.platform_fee_rate}%
          </p>
        </div>
        <button
          type="button"
          className={`${Sam.btn.primary} min-h-[44px] w-full`}
          onClick={() =>
            go({
              tab: "products",
              products: "products",
              extra: { id: prodSuccess.id },
            })
          }
        >
          {safeT("gift_ops_cta_detail", { fallbackKo: "상세", fallbackEn: "Detail" })}
        </button>
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
              {safeT("gift_ops_field_type", { fallbackKo: "상품권 종류", fallbackEn: "Gift type" })}:{" "}
              {labelScope("STORE")}
            </p>
            <p>
              {safeT("gift_ops_field_store", { fallbackKo: "매장", fallbackEn: "Store" })}:{" "}
              {detail.store_name}
            </p>
            <p className="font-semibold">{prodTitle}</p>
            <p className="tabular-nums">
              Face {formatMoneyPhp(face)} · Purchase {formatMoneyPhp(price)} · Fee{" "}
              {Math.trunc(Number(prodFee) || 0)}%
            </p>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="button"
            className={`${Sam.btn.primary} min-h-[48px] w-full`}
            disabled={busy}
            onClick={() =>
              void createProduct({
                giftScope: "STORE",
                applicationId: detail.id,
                storeId: detail.store_id,
              })
            }
          >
            {safeT("gift_ops_cta_start_sale", { fallbackKo: "판매 시작", fallbackEn: "Start selling" })}
          </button>
          <button
            type="button"
            className="min-h-[44px] w-full rounded-ui-rect border border-sam-border text-sm font-semibold"
            onClick={() => setProdReview(false)}
          >
            {safeT("gift_admin_cta_back", { fallbackKo: "돌아가기", fallbackEn: "Back" })}
          </button>
        </section>
      );
    }
    const face = Math.trunc(Number(prodFace) || 0);
    const price = Math.trunc(Number(prodPrice) || 0);
    return (
      <section className="space-y-4" data-admin-gift-product-create="1">
        {subTabs}
        <h2 className="text-lg font-semibold">
          {safeT("gift_admin_product_create_title", {
            fallbackKo: "신청 승인 후 상품 만들기",
            fallbackEn: "Approve & create product",
          })}
        </h2>
        <p className="text-sm text-sam-muted">
          {detail.store_name} · {detail.owner_label || shortId(detail.owner_user_id)}
        </p>
        {formFields}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="button"
          className={`${Sam.btn.primary} min-h-[48px] w-full`}
          disabled={!prodTitle.trim() || face <= 0 || price < 0}
          onClick={() => setProdReview(true)}
        >
          {safeT("gift_admin_cta_review_product", {
            fallbackKo: "판매 내용 확인",
            fallbackEn: "Review product",
          })}
        </button>
        <button
          type="button"
          className="min-h-[44px] w-full rounded-ui-rect border border-sam-border text-sm font-semibold"
          onClick={() => go({ tab: "products", products: "applications", extra: { id } })}
        >
          {safeT("gift_admin_cta_back", { fallbackKo: "돌아가기", fallbackEn: "Back" })}
        </button>
      </section>
    );
  }

  if (productsSubtab === "applications" && id && detail) {
    return (
      <section className="space-y-4" data-admin-gift-application-detail="1">
        {subTabs}
        <h2 className="text-lg font-semibold">
          {safeT("gift_admin_detail_title", {
            fallbackKo: "상품권 판매 신청 검토",
            fallbackEn: "Review gift application",
          })}
        </h2>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm space-y-1">
          <p className="font-semibold">{detail.title}</p>
          <p>
            {safeT("gift_ops_field_store", { fallbackKo: "매장", fallbackEn: "Store" })}:{" "}
            {detail.store_name || "—"}
          </p>
          <p>
            {safeT("gift_ops_field_owner", { fallbackKo: "오너", fallbackEn: "Owner" })}:{" "}
            {detail.owner_label || shortId(detail.owner_user_id)}
          </p>
          <p className="tabular-nums">Face {formatMoneyPhp(detail.requested_face_value)}</p>
          <p>Status: {detail.status}</p>
          <p className="text-xs text-sam-muted">{dt(detail.created_at)}</p>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {detail.status === "submitted" ||
        detail.status === "under_review" ||
        detail.status === "approved" ? (
          <button
            type="button"
            className={`${Sam.btn.primary} min-h-[48px] w-full`}
            onClick={() =>
              go({ tab: "products", products: "applications", extra: { id, create: "1" } })
            }
          >
            {safeT("gift_admin_cta_approve_create", {
              fallbackKo: "승인 후 상품 만들기",
              fallbackEn: "Approve & create product",
            })}
          </button>
        ) : null}
        {detail.status === "submitted" || detail.status === "under_review" ? (
          <>
            <button
              type="button"
              className="min-h-[44px] w-full rounded-ui-rect border border-sam-border text-sm font-semibold"
              disabled={busy}
              onClick={() => void patchStatus("under_review")}
            >
              {safeT("gift_admin_cta_mark_review", {
                fallbackKo: "검토 중으로 표시",
                fallbackEn: "Mark under review",
              })}
            </button>
            <button
              type="button"
              className="min-h-[44px] w-full rounded-ui-rect border border-red-300 text-sm font-semibold text-red-700"
              onClick={() => setRejectOpen(true)}
            >
              {safeT("gift_admin_cta_reject", { fallbackKo: "반려", fallbackEn: "Reject" })}
            </button>
          </>
        ) : null}
        {rejectOpen ? (
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <textarea
              className="min-h-[88px] w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <button
              type="button"
              className="mt-3 min-h-[44px] w-full rounded-ui-rect bg-red-600 text-sm font-semibold text-white disabled:opacity-60"
              disabled={busy || !rejectReason.trim()}
              onClick={() => void patchStatus("rejected", rejectReason.trim())}
            >
              {safeT("gift_admin_cta_reject_confirm", {
                fallbackKo: "반려 확정",
                fallbackEn: "Confirm rejection",
              })}
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="min-h-[44px] w-full rounded-ui-rect border border-sam-border text-sm font-semibold"
          onClick={() => go({ tab: "products", products: "applications" })}
        >
          {safeT("gift_admin_cta_back_list", { fallbackKo: "목록으로", fallbackEn: "Back to list" })}
        </button>
      </section>
    );
  }

  if (productsSubtab === "products" && id && productDetail) {
    const scope = productDetail.gift_scope === "PLATFORM" ? "PLATFORM" : "STORE";
    return (
      <section className="space-y-4" data-admin-gift-product-detail="1">
        {subTabs}
        {productInstanceNote}
        <h2 className="text-lg font-semibold">{productDetail.title}</h2>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm space-y-1">
          <p>
            {safeT("gift_ops_field_type", { fallbackKo: "상품권 종류", fallbackEn: "Gift type" })}:{" "}
            {labelScope(scope)}
          </p>
          <p>
            {scope === "PLATFORM"
              ? safeT("gift_ops_usable_platform", {
                  fallbackKo: "사용 범위: DIBAY eligible stores",
                  fallbackEn: "Usable at: DIBAY eligible stores",
                })
              : `${safeT("gift_ops_field_store", { fallbackKo: "매장", fallbackEn: "Store" })}: ${
                  productDetail.store_name || "—"
                }`}
          </p>
          <p className="tabular-nums">Face {formatMoneyPhp(productDetail.face_value)}</p>
          <p className="tabular-nums">Purchase {formatMoneyPhp(productDetail.purchase_price)}</p>
          <p>Fee {productDetail.platform_fee_rate}%</p>
          <p>
            {dt(productDetail.sales_starts_at)} → {dt(productDetail.sales_ends_at)}
          </p>
          <p>
            {productDetail.archived_at
              ? "ARCHIVED"
              : productDetail.active
                ? "ACTIVE"
                : "PAUSED"}
          </p>
          <p className="tabular-nums">
            Issued {productDetail.issued_count} · Outstanding{" "}
            {formatMoneyPhp(productDetail.outstanding_balance)} · Redeemed{" "}
            {formatMoneyPhp(productDetail.redeemed_gross)}
          </p>
          {productDetail.creation_source ? (
            <p className="text-xs text-sam-muted">Source: {productDetail.creation_source}</p>
          ) : null}
        </div>
        {scope === "PLATFORM" && (productDetail.redemption_by_store?.length ?? 0) > 0 ? (
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="mb-2 text-sm font-semibold">
              {safeT("gift_ops_redeem_by_store", {
                fallbackKo: "매장별 사용",
                fallbackEn: "Redemption by store",
              })}
            </p>
            <ul className="space-y-1 text-sm">
              {productDetail.redemption_by_store!.map((r) => (
                <li key={r.store_id} className="tabular-nums">
                  {r.store_name || shortId(r.store_id)}: Gross {formatMoneyPhp(r.gross)} · Fee{" "}
                  {formatMoneyPhp(r.fee)} · Net {formatMoneyPhp(r.net)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          {productDetail.active ? (
            <button
              type="button"
              className={Sam.btn.secondary}
              disabled={busy}
              onClick={() => void patchProduct("pause")}
            >
              {safeT("gift_ops_cta_pause", { fallbackKo: "판매중지", fallbackEn: "Pause sales" })}
            </button>
          ) : (
            <button
              type="button"
              className={Sam.btn.primary}
              disabled={busy || !!productDetail.archived_at}
              onClick={() => void patchProduct("activate")}
            >
              {safeT("gift_ops_cta_resume", { fallbackKo: "판매 재개", fallbackEn: "Resume sales" })}
            </button>
          )}
          {!productDetail.archived_at ? (
            <button
              type="button"
              className={Sam.btn.secondary}
              disabled={busy}
              onClick={() => void patchProduct("archive")}
            >
              {safeT("gift_ops_cta_archive", { fallbackKo: "보관", fallbackEn: "Archive" })}
            </button>
          ) : null}
          {productDetail.issued_count === 0 ? (
            <button
              type="button"
              className="rounded-ui-rect border border-red-300 px-3 py-2 text-sm font-semibold text-red-700"
              disabled={busy}
              onClick={() => void deleteProduct()}
            >
              {safeT("gift_ops_cta_delete", { fallbackKo: "삭제", fallbackEn: "Delete" })}
            </button>
          ) : null}
        </div>
        <Link
          href={buildAdminGiftOpsHref({ tab: "instances", extra: { q: productDetail.id } })}
          className={`${Sam.btn.primary} inline-flex min-h-[44px] items-center justify-center px-4`}
        >
          {safeT("gift_ops_cta_instances", {
            fallbackKo: "상품권 현황 보기",
            fallbackEn: "View instances",
          })}
        </Link>
        <button
          type="button"
          className="min-h-[44px] w-full rounded-ui-rect border border-sam-border text-sm font-semibold"
          onClick={() => go({ tab: "products", products: "products" })}
        >
          {safeT("gift_admin_cta_back_list", { fallbackKo: "목록으로", fallbackEn: "Back to list" })}
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-4" data-admin-gift-issuance-panel="1">
      {subTabs}
      {productInstanceNote}

      {productsSubtab === "applications" ? (
        <p className="text-xs text-sam-muted">
          {safeT("gift_ops_applications_note", {
            fallbackKo: "매장 오너 판매 신청만 표시합니다. Admin 직접 발급은 「상품권 상품」에서 합니다.",
            fallbackEn: "Owner sale requests only. Admin direct issuance is under Gift products.",
          })}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`${Sam.btn.primary} min-h-[40px] px-4 text-sm`}
            onClick={() => go({ tab: "products", products: "products", extra: { create: "1" } })}
          >
            {safeT("gift_ops_cta_new_product", {
              fallbackKo: "+ 새 상품권 만들기",
              fallbackEn: "+ Create gift product",
            })}
          </button>
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
                ? safeT("gift_ops_range_all", { fallbackKo: "전체", fallbackEn: "All" })
                : sc === "STORE"
                  ? safeT("gift_ops_type_store", { fallbackKo: "매장", fallbackEn: "Store" })
                  : safeT("gift_ops_type_platform", { fallbackKo: "DIBAY", fallbackEn: "DIBAY" })}
            </Link>
          ))}
        </div>
      )}

      {listState === "loading" ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_ops_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
        </p>
      ) : null}

      {listState === "error" ? (
        <div className="space-y-2">
          <p className="text-sm text-red-600">
            {safeT("gift_ops_list_error", {
              fallbackKo: "목록을 불러오지 못했습니다.",
              fallbackEn: "Couldn’t load the list.",
            })}
          </p>
          <button
            type="button"
            className={Sam.btn.secondary}
            onClick={() => void (productsSubtab === "applications" ? loadApps() : loadProducts())}
          >
            {safeT("gift_ops_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
          </button>
        </div>
      ) : null}

      {listState === "empty" ? (
        <p className="text-sm text-sam-muted">
          {productsSubtab === "applications"
            ? safeT("gift_admin_empty_apps", {
                fallbackKo: "처리할 신청이 없습니다.",
                fallbackEn: "No applications to review.",
              })
            : safeT("gift_admin_empty_products", {
                fallbackKo: "등록된 상품권이 없습니다. [+ 새 상품권 만들기]로 발급하세요.",
                fallbackEn: "No gift products yet. Use + Create gift product.",
              })}
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
                  <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(r.requested_face_value)}</td>
                  <td className="px-2 py-2">{r.status}</td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      className={`${Sam.btn.primary} px-3 py-1.5 text-xs`}
                      onClick={() =>
                        go({ tab: "products", products: "applications", extra: { id: r.id } })
                      }
                    >
                      {safeT("gift_admin_cta_review", { fallbackKo: "검토", fallbackEn: "Review" })}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {listState === "data" && productsSubtab === "products" ? (
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-sam-border text-xs text-sam-muted">
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">Store</th>
                <th className="px-2 py-2">Title</th>
                <th className="px-2 py-2">Face</th>
                <th className="px-2 py-2">Purchase</th>
                <th className="px-2 py-2">Fee%</th>
                <th className="px-2 py-2">Window</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Issued</th>
                <th className="px-2 py-2">Outstanding</th>
                <th className="px-2 py-2">Redeemed Gross</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const sc = p.gift_scope === "PLATFORM" ? "PLATFORM" : "STORE";
                return (
                  <tr key={p.id} className="border-b border-sam-border/60">
                    <td className="px-2 py-2 text-xs">{sc === "PLATFORM" ? "DIBAY" : "STORE"}</td>
                    <td className="px-2 py-2">
                      {sc === "PLATFORM"
                        ? safeT("gift_ops_store_all_dibay", {
                            fallbackKo: "DIBAY 전체",
                            fallbackEn: "All DIBAY",
                          })
                        : p.store_name || "—"}
                    </td>
                    <td className="px-2 py-2 font-semibold">{p.title}</td>
                    <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(p.face_value)}</td>
                    <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(p.purchase_price)}</td>
                    <td className="px-2 py-2">{p.platform_fee_rate}%</td>
                    <td className="px-2 py-2 text-xs">
                      {dt(p.sales_starts_at)} → {dt(p.sales_ends_at)}
                    </td>
                    <td className="px-2 py-2">
                      {p.archived_at ? "ARCHIVED" : p.active ? "ACTIVE" : "PAUSED"}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{p.issued_count}</td>
                    <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(p.outstanding_balance)}</td>
                    <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(p.redeemed_gross)}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className={`${Sam.btn.primary} px-3 py-1.5 text-xs`}
                        onClick={() =>
                          go({ tab: "products", products: "products", extra: { id: p.id } })
                        }
                      >
                        {safeT("gift_ops_cta_detail", { fallbackKo: "상세", fallbackEn: "Detail" })}
                      </button>
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
          {products.map((p) => {
            const sc = p.gift_scope === "PLATFORM" ? "PLATFORM" : "STORE";
            return (
              <li key={p.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                <p className="text-xs text-sam-muted">{labelScope(sc)}</p>
                <p className="font-semibold">{p.title}</p>
                <p className="text-xs tabular-nums">
                  {formatMoneyPhp(p.face_value)} · {p.active ? "ACTIVE" : "PAUSED"}
                </p>
                <button
                  type="button"
                  className={`${Sam.btn.primary} mt-3 w-full min-h-[40px] text-sm`}
                  onClick={() => go({ tab: "products", products: "products", extra: { id: p.id } })}
                >
                  {safeT("gift_ops_cta_detail", { fallbackKo: "상세", fallbackEn: "Detail" })}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
