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

type ProductRow = {
  id: string;
  store_id: string;
  store_name: string;
  title: string;
  face_value: number;
  purchase_price: number;
  platform_fee_rate: number;
  sales_starts_at: string | null;
  sales_ends_at: string | null;
  active: boolean;
  issued_count: number;
  outstanding_balance: number;
  redeemed_gross: number;
  transferable?: boolean;
  image_url?: string | null;
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
}: {
  productsSubtab: AdminGiftOpsProductsSubtab;
  id: string;
  create: boolean;
  storeId: string;
}) {
  const { safeT } = useI18n();
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
      const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
      const res = await fetch(`/api/admin/gift-certificates/products${qs}`, {
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
      if (id) {
        setProductDetail(rows.find((p) => p.id === id) ?? null);
      } else {
        setProductDetail(null);
      }
    } catch {
      setProducts([]);
      setListState("error");
    }
  }, [id, storeId]);

  const loadAppDetail = useCallback(async (appId: string) => {
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
  }, [safeT]);

  useEffect(() => {
    if (productsSubtab === "applications") void loadApps();
    else void loadProducts();
  }, [loadApps, loadProducts, productsSubtab]);

  useEffect(() => {
    if (productsSubtab === "applications" && id) void loadAppDetail(id);
    else if (productsSubtab === "applications") setDetail(null);
  }, [id, loadAppDetail, productsSubtab]);

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

  const createProduct = async () => {
    if (!detail || busy) return;
    setBusy(true);
    setError(null);
    try {
      const salesStartsAt = prodStart
        ? new Date(prodStart).toISOString()
        : new Date().toISOString();
      const salesEndsAt = prodEnd ? new Date(prodEnd).toISOString() : null;
      const res = await fetch("/api/admin/gift-certificates/products", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: detail.id,
          storeId: detail.store_id,
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
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        product?: ProductRow;
        error?: string;
      };
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
        store_name: detail.store_name,
        outstanding_balance: 0,
        redeemed_gross: 0,
        issued_count: Math.trunc(Number(json.product.issued_count) || 0),
        platform_fee_rate: Math.trunc(Number(json.product.platform_fee_rate) || Number(prodFee) || 0),
      });
      await loadApps();
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
          fallbackKo: "판매 신청",
          fallbackEn: "Applications",
        })}
      </Link>
      <Link
        href={buildAdminGiftOpsHref({
          tab: "products",
          products: "products",
          extra: storeId ? { storeId } : undefined,
        })}
        className={[
          "rounded-ui-rect px-3 py-1.5 text-xs font-semibold",
          productsSubtab === "products"
            ? "bg-sam-fg text-sam-app"
            : "border border-sam-border bg-sam-surface",
        ].join(" ")}
      >
        {safeT("gift_ops_sub_products", {
          fallbackKo: "판매 상품",
          fallbackEn: "Products",
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
            <span className="text-sam-muted">
              {safeT("gift_ops_field_store", { fallbackKo: "매장", fallbackEn: "Store" })}:
            </span>{" "}
            {prodSuccess.store_name || "—"}
          </p>
          <p>
            <span className="text-sam-muted">
              {safeT("gift_ops_field_face", { fallbackKo: "Face", fallbackEn: "Face" })}:
            </span>{" "}
            <span className="tabular-nums">{formatMoneyPhp(prodSuccess.face_value)}</span>
          </p>
          <p>
            <span className="text-sam-muted">
              {safeT("gift_ops_field_purchase", { fallbackKo: "구매가", fallbackEn: "Purchase" })}:
            </span>{" "}
            <span className="tabular-nums">{formatMoneyPhp(prodSuccess.purchase_price)}</span>
          </p>
          <p>
            <span className="text-sam-muted">
              {safeT("gift_ops_field_fee", { fallbackKo: "수수료", fallbackEn: "Fee" })}:
            </span>{" "}
            {prodSuccess.platform_fee_rate}%
          </p>
          <p>
            <span className="text-sam-muted">
              {safeT("gift_ops_field_window", {
                fallbackKo: "판매 기간",
                fallbackEn: "Sales window",
              })}
              :
            </span>{" "}
            {dt(prodSuccess.sales_starts_at)} → {dt(prodSuccess.sales_ends_at)}
          </p>
          <p>
            <span className="text-sam-muted">
              {safeT("gift_ops_field_status", { fallbackKo: "상태", fallbackEn: "Status" })}:
            </span>{" "}
            {prodSuccess.active ? "ACTIVE" : "INACTIVE"}
          </p>
          <details className="mt-2 text-xs text-sam-muted">
            <summary>
              {safeT("gift_ops_technical", {
                fallbackKo: "기술 정보",
                fallbackEn: "Technical details",
              })}
            </summary>
            <p className="mt-1 break-all font-mono">Product ID: {prodSuccess.id}</p>
          </details>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={buildAdminGiftOpsHref({ tab: "instances" })}
            className={`${Sam.btn.primary} inline-flex min-h-[44px] items-center justify-center px-4`}
          >
            {safeT("gift_ops_cta_instances", {
              fallbackKo: "상품권 현황 보기",
              fallbackEn: "View instances",
            })}
          </Link>
          <Link
            href={buildAdminGiftOpsHref({
              tab: "products",
              products: "products",
              extra: { storeId: detail?.store_id ?? prodSuccess.store_id },
            })}
            className="inline-flex min-h-[44px] items-center justify-center rounded-ui-rect border border-sam-border px-4 text-sm font-semibold"
          >
            {safeT("gift_ops_cta_store_products", {
              fallbackKo: "매장 상품권 보기",
              fallbackEn: "View store products",
            })}
          </Link>
        </div>
      </section>
    );
  }

  if (productsSubtab === "applications" && id && create && detail) {
    const face = Math.trunc(Number(prodFace) || 0);
    const price = Math.trunc(Number(prodPrice) || 0);
    if (prodReview) {
      return (
        <section className="space-y-4" data-admin-gift-product-review="1">
          {subTabs}
          <h2 className="text-lg font-semibold">
            {safeT("gift_admin_product_review_title", {
              fallbackKo: "판매 시작 전 확인",
              fallbackEn: "Review before going live",
            })}
          </h2>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm space-y-1">
            <p className="font-semibold">{prodTitle}</p>
            <p className="text-sam-muted">{detail.store_name}</p>
            <p>Face {formatMoneyPhp(face)}</p>
            <p>Purchase {formatMoneyPhp(price)}</p>
            <p>Fee {Math.trunc(Number(prodFee) || 0)}%</p>
            <p>
              {dt(prodStart ? new Date(prodStart).toISOString() : null)} →{" "}
              {dt(prodEnd ? new Date(prodEnd).toISOString() : null)}
            </p>
            <p>
              {safeT("gift_admin_field_transferable", {
                fallbackKo: "선물 가능",
                fallbackEn: "Transferable",
              })}
              : {prodTransferable ? "Y" : "N"}
            </p>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="button"
            className={`${Sam.btn.primary} min-h-[48px] w-full`}
            disabled={busy}
            onClick={() => void createProduct()}
          >
            {safeT("gift_admin_cta_start_sale", {
              fallbackKo: "상품권 판매 시작",
              fallbackEn: "Start selling",
            })}
          </button>
          <button
            type="button"
            className="min-h-[44px] w-full rounded-ui-rect border border-sam-border text-sm font-semibold"
            onClick={() => setProdReview(false)}
          >
            {safeT("gift_owner_cta_edit", { fallbackKo: "수정하기", fallbackEn: "Edit" })}
          </button>
        </section>
      );
    }

    return (
      <section className="space-y-4" data-admin-gift-product-create="1">
        {subTabs}
        <h2 className="text-lg font-semibold">
          {safeT("gift_admin_product_create_title", {
            fallbackKo: "승인 후 상품 만들기",
            fallbackEn: "Approve & create product",
          })}
        </h2>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <label className="block text-sm">
          <span className="mb-1 block text-sam-muted">
            {safeT("gift_admin_field_title", { fallbackKo: "상품권 이름", fallbackEn: "Gift title" })}
          </span>
          <input className={Sam.input.base} value={prodTitle} onChange={(e) => setProdTitle(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-sam-muted">
            {safeT("gift_admin_field_face", { fallbackKo: "액면가", fallbackEn: "Face value" })}
          </span>
          <input className={Sam.input.base} value={prodFace} onChange={(e) => setProdFace(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-sam-muted">
            {safeT("gift_admin_field_price", {
              fallbackKo: "구매가 (Point)",
              fallbackEn: "Purchase price (Points)",
            })}
          </span>
          <input className={Sam.input.base} value={prodPrice} onChange={(e) => setProdPrice(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-sam-muted">
            {safeT("gift_admin_field_fee", {
              fallbackKo: "플랫폼 수수료 %",
              fallbackEn: "Platform fee %",
            })}
          </span>
          <input className={Sam.input.base} value={prodFee} onChange={(e) => setProdFee(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-sam-muted">
            {safeT("gift_ops_field_sales_start", {
              fallbackKo: "판매 시작",
              fallbackEn: "Sales start",
            })}
          </span>
          <input
            type="datetime-local"
            className={Sam.input.base}
            value={prodStart}
            onChange={(e) => setProdStart(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-sam-muted">
            {safeT("gift_ops_field_sales_end", {
              fallbackKo: "판매 종료 (선택)",
              fallbackEn: "Sales end (optional)",
            })}
          </span>
          <input
            type="datetime-local"
            className={Sam.input.base}
            value={prodEnd}
            onChange={(e) => setProdEnd(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-sam-muted">
            {safeT("gift_admin_field_artwork", {
              fallbackKo: "디자인 URL",
              fallbackEn: "Artwork URL",
            })}
          </span>
          <input className={Sam.input.base} value={prodImage} onChange={(e) => setProdImage(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={prodTransferable}
            onChange={(e) => setProdTransferable(e.target.checked)}
          />
          {safeT("gift_admin_field_transferable", {
            fallbackKo: "선물 가능",
            fallbackEn: "Transferable",
          })}
        </label>
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
          onClick={() =>
            go({ tab: "products", products: "applications", extra: { id } })
          }
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
          {detail.requested_purchase_price != null ? (
            <p className="tabular-nums">
              Purchase {formatMoneyPhp(detail.requested_purchase_price)}
            </p>
          ) : null}
          <p>Status: {detail.status}</p>
          <p className="text-xs text-sam-muted">{dt(detail.created_at)}</p>
          {detail.design_notes ? (
            <p className="mt-2 whitespace-pre-wrap">{detail.design_notes}</p>
          ) : null}
          {detail.rejection_reason ? (
            <p className="mt-2 text-red-600">{detail.rejection_reason}</p>
          ) : null}
          <details className="mt-2 text-xs text-sam-muted">
            <summary>
              {safeT("gift_ops_technical", {
                fallbackKo: "기술 정보",
                fallbackEn: "Technical details",
              })}
            </summary>
            <p className="mt-1 break-all font-mono">Application ID: {detail.id}</p>
            <p className="break-all font-mono">Owner ID: {detail.owner_user_id}</p>
            <p className="break-all font-mono">Store ID: {detail.store_id}</p>
          </details>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {detail.status === "submitted" ||
        detail.status === "under_review" ||
        detail.status === "approved" ? (
          <button
            type="button"
            className={`${Sam.btn.primary} min-h-[48px] w-full`}
            onClick={() =>
              go({
                tab: "products",
                products: "applications",
                extra: { id, create: "1" },
              })
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
            <p className="mb-2 text-sm font-semibold">
              {safeT("gift_admin_reject_reason_label", {
                fallbackKo: "반려 사유",
                fallbackEn: "Rejection reason",
              })}
            </p>
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
          {safeT("gift_admin_cta_back_list", {
            fallbackKo: "목록으로",
            fallbackEn: "Back to list",
          })}
        </button>
      </section>
    );
  }

  if (productsSubtab === "products" && id && productDetail) {
    return (
      <section className="space-y-4" data-admin-gift-product-detail="1">
        {subTabs}
        {productInstanceNote}
        <h2 className="text-lg font-semibold">{productDetail.title}</h2>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm space-y-1">
          <p>{productDetail.store_name || "—"}</p>
          <p className="tabular-nums">Face {formatMoneyPhp(productDetail.face_value)}</p>
          <p className="tabular-nums">Purchase {formatMoneyPhp(productDetail.purchase_price)}</p>
          <p>Fee {productDetail.platform_fee_rate}%</p>
          <p>
            {dt(productDetail.sales_starts_at)} → {dt(productDetail.sales_ends_at)}
          </p>
          <p>{productDetail.active ? "ACTIVE" : "INACTIVE"}</p>
          <p className="tabular-nums">
            Issued {productDetail.issued_count} · Outstanding{" "}
            {formatMoneyPhp(productDetail.outstanding_balance)} · Redeemed{" "}
            {formatMoneyPhp(productDetail.redeemed_gross)}
          </p>
          <details className="mt-2 text-xs text-sam-muted">
            <summary>
              {safeT("gift_ops_technical", {
                fallbackKo: "기술 정보",
                fallbackEn: "Technical details",
              })}
            </summary>
            <p className="mt-1 break-all font-mono">Product ID: {productDetail.id}</p>
            <p className="break-all font-mono">Store ID: {productDetail.store_id}</p>
          </details>
        </div>
        <Link
          href={buildAdminGiftOpsHref({
            tab: "instances",
            extra: { q: productDetail.id },
          })}
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
          onClick={() =>
            go({
              tab: "products",
              products: "products",
              extra: storeId ? { storeId } : undefined,
            })
          }
        >
          {safeT("gift_admin_cta_back_list", {
            fallbackKo: "목록으로",
            fallbackEn: "Back to list",
          })}
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-4" data-admin-gift-issuance-panel="1">
      {subTabs}
      {productInstanceNote}

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
            onClick={() =>
              void (productsSubtab === "applications" ? loadApps() : loadProducts())
            }
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
                fallbackKo: "등록된 상품권이 없습니다. 신청을 검토해 상품을 만드세요.",
                fallbackEn: "No gift products yet. Review an application to create one.",
              })}
        </p>
      ) : null}

      {listState === "data" && productsSubtab === "applications" ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-sam-border text-xs text-sam-muted">
                  <th className="px-2 py-2">Store</th>
                  <th className="px-2 py-2">Owner</th>
                  <th className="px-2 py-2">Title</th>
                  <th className="px-2 py-2">Face</th>
                  <th className="px-2 py-2">Purchase</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {apps.map((r) => (
                  <tr key={r.id} className="border-b border-sam-border/60">
                    <td className="px-2 py-2">{r.store_name || "—"}</td>
                    <td className="px-2 py-2">
                      <p>{r.owner_label || shortId(r.owner_user_id)}</p>
                      <p className="text-[11px] text-sam-muted font-mono">{shortId(r.owner_user_id)}</p>
                    </td>
                    <td className="px-2 py-2 font-semibold">{r.title}</td>
                    <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(r.requested_face_value)}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {r.requested_purchase_price != null
                        ? formatMoneyPhp(r.requested_purchase_price)
                        : "—"}
                    </td>
                    <td className="px-2 py-2">{r.status}</td>
                    <td className="px-2 py-2 text-xs text-sam-muted">{dt(r.created_at)}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className={`${Sam.btn.primary} px-3 py-1.5 text-xs`}
                        onClick={() =>
                          go({ tab: "products", products: "applications", extra: { id: r.id } })
                        }
                      >
                        {safeT("gift_admin_cta_review", {
                          fallbackKo: "검토",
                          fallbackEn: "Review",
                        })}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {apps.map((r) => (
              <li key={r.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                <p className="font-semibold">{r.title}</p>
                <p className="text-xs text-sam-muted">
                  {r.store_name || "—"} · {r.owner_label || shortId(r.owner_user_id)}
                </p>
                <p className="mt-1 text-xs tabular-nums">
                  Face {formatMoneyPhp(r.requested_face_value)}
                  {r.requested_purchase_price != null
                    ? ` · Purchase ${formatMoneyPhp(r.requested_purchase_price)}`
                    : ""}{" "}
                  · {r.status}
                </p>
                <button
                  type="button"
                  className={`${Sam.btn.primary} mt-3 w-full min-h-[40px] text-sm`}
                  onClick={() =>
                    go({ tab: "products", products: "applications", extra: { id: r.id } })
                  }
                >
                  {safeT("gift_admin_cta_review", {
                    fallbackKo: "검토",
                    fallbackEn: "Review",
                  })}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {listState === "data" && productsSubtab === "products" ? (
        <>
          {storeId ? (
            <p className="text-xs text-sam-muted">
              {safeT("gift_ops_filtered_store", {
                fallbackKo: "매장 필터 적용 중",
                fallbackEn: "Filtered by store",
              })}
              : {shortId(storeId)}
            </p>
          ) : null}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-sam-border text-xs text-sam-muted">
                  <th className="px-2 py-2">Store</th>
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2">Face</th>
                  <th className="px-2 py-2">Purchase</th>
                  <th className="px-2 py-2">Fee%</th>
                  <th className="px-2 py-2">Sales Window</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Issued</th>
                  <th className="px-2 py-2">Outstanding</th>
                  <th className="px-2 py-2">Redeemed Gross</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-sam-border/60">
                    <td className="px-2 py-2">{p.store_name || "—"}</td>
                    <td className="px-2 py-2 font-semibold">{p.title}</td>
                    <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(p.face_value)}</td>
                    <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(p.purchase_price)}</td>
                    <td className="px-2 py-2">{p.platform_fee_rate}%</td>
                    <td className="px-2 py-2 text-xs">
                      {dt(p.sales_starts_at)} → {dt(p.sales_ends_at)}
                    </td>
                    <td className="px-2 py-2">{p.active ? "ACTIVE" : "INACTIVE"}</td>
                    <td className="px-2 py-2 tabular-nums">{p.issued_count}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {formatMoneyPhp(p.outstanding_balance)}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{formatMoneyPhp(p.redeemed_gross)}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className={`${Sam.btn.secondary} px-3 py-1.5 text-xs`}
                        onClick={() =>
                          go({
                            tab: "products",
                            products: "products",
                            extra: { id: p.id, storeId: storeId || undefined },
                          })
                        }
                      >
                        {safeT("gift_ops_cta_detail", {
                          fallbackKo: "상세",
                          fallbackEn: "Detail",
                        })}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {products.map((p) => (
              <li key={p.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                <p className="font-semibold">{p.title}</p>
                <p className="text-xs text-sam-muted">{p.store_name || "—"}</p>
                <p className="mt-1 text-xs tabular-nums">
                  Face {formatMoneyPhp(p.face_value)} · Purchase {formatMoneyPhp(p.purchase_price)} ·{" "}
                  {p.platform_fee_rate}% · Issued {p.issued_count}
                </p>
                <button
                  type="button"
                  className={`${Sam.btn.secondary} mt-3 w-full min-h-[40px] text-sm`}
                  onClick={() =>
                    go({
                      tab: "products",
                      products: "products",
                      extra: { id: p.id, storeId: storeId || undefined },
                    })
                  }
                >
                  {safeT("gift_ops_cta_detail", {
                    fallbackKo: "상세",
                    fallbackEn: "Detail",
                  })}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
