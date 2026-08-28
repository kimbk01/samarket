"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/css-vars";
import { dibayAlert, dibayConfirm } from "@/components/ui/dibay-overlay";
import { resolveGiftProductFundingFromGap } from "@/lib/gift-certificate/gift-promo-economics";

type ApplicationRow = {
  id: string;
  store_id: string;
  store_name: string;
  owner_user_id: string;
  title: string;
  requested_face_value: number;
  requested_purchase_price: number | null;
  image_url: string | null;
  status: string;
  design_notes: string | null;
  rejection_reason: string | null;
  created_at: string;
};

export function AdminGiftApplicationsPage() {
  const { safeT } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const id = sp.get("id")?.trim() ?? "";
  const create = sp.get("create") === "1";
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [detail, setDetail] = useState<ApplicationRow | null>(null);
  const [loaded, setLoaded] = useState(false);
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
  const [prodReview, setProdReview] = useState(false);
  const [prodSuccessId, setProdSuccessId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoaded(false);
    const res = await fetch("/api/admin/gift-certificates/applications", {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as { ok?: boolean; applications?: ApplicationRow[] };
    setRows(json.ok ? json.applications ?? [] : []);
    setLoaded(true);
  }, []);

  const loadDetail = useCallback(async (appId: string) => {
    const res = await fetch(`/api/admin/gift-certificates/applications/${encodeURIComponent(appId)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as { ok?: boolean; application?: ApplicationRow };
    if (json.ok && json.application) {
      setDetail(json.application);
      setProdTitle(json.application.title);
      setProdFace(String(json.application.requested_face_value));
      setProdPrice(
        json.application.requested_purchase_price != null
          ? String(json.application.requested_purchase_price)
          : String(json.application.requested_face_value)
      );
      setProdImage(json.application.image_url ?? "");
    } else {
      setDetail(null);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (id) void loadDetail(id);
    else setDetail(null);
  }, [id, loadDetail]);

  const patchStatus = async (action: "under_review" | "rejected", reason?: string) => {
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/gift-certificates/applications/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          rejectionReason: reason,
        }),
      });
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
      await loadList();
      await loadDetail(id);
    } finally {
      setBusy(false);
    }
  };

  const createProduct = async () => {
    if (!detail || busy) return;
    const confirmed = await dibayConfirm({
      title: safeT("gift_admin_register_confirm_title", {
        fallbackKo: "상품권을 등록할까요?",
        fallbackEn: "Register this gift product?",
      }),
      description: safeT("gift_admin_register_confirm_body", {
        fallbackKo: "확인을 누르면 판매가 시작됩니다. 취소하면 등록되지 않습니다.",
        fallbackEn: "Confirm to start selling. Cancel leaves it unregistered.",
      }),
      cancelLabel: safeT("gift_admin_register_confirm_cancel", {
        fallbackKo: "취소",
        fallbackEn: "Cancel",
      }),
      confirmLabel: safeT("gift_admin_register_confirm_ok", {
        fallbackKo: "등록 확정",
        fallbackEn: "Confirm registration",
      }),
      blocking: true,
    });
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      const faceValue = Math.trunc(Number(prodFace));
      const purchasePrice = Math.trunc(Number(prodPrice));
      const promoGap = Math.max(0, faceValue - purchasePrice);
      const discountFundingParty = promoGap > 0 ? "MERCHANT" : "NONE";
      const fundingUnits = resolveGiftProductFundingFromGap({
        faceValue,
        purchasePrice,
        discountFundingParty,
      });
      const res = await fetch("/api/admin/gift-certificates/products", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: detail.id,
          storeId: detail.store_id,
          title: prodTitle.trim(),
          faceValue,
          purchasePrice,
          platformFeeRate: Math.trunc(Number(prodFee) || 0),
          discountFundingParty,
          platformFundedUnits: fundingUnits.dibayUnits,
          merchantFundedUnits: fundingUnits.ownerUnits,
          transferable: prodTransferable,
          imageUrl: prodImage.trim() || null,
          salesStartsAt: new Date().toISOString(),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; product?: { id?: string }; error?: string };
      if (!res.ok || !json.ok) {
        setError(
          safeT("gift_admin_product_fail", {
            fallbackKo: "상품권 상품을 만들지 못했습니다.",
            fallbackEn: "Could not create gift product.",
          })
        );
        return;
      }
      await dibayAlert({
        title: safeT("gift_admin_product_success_title", {
          fallbackKo: "상품권이 판매 등록되었습니다.",
          fallbackEn: "Gift product is now on sale.",
        }),
        confirmLabel: safeT("gift_admin_product_success_ok", {
          fallbackKo: "확인",
          fallbackEn: "OK",
        }),
      });
      setProdSuccessId(String(json.product?.id ?? ""));
      await loadList();
    } finally {
      setBusy(false);
    }
  };

  if (prodSuccessId) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4" data-admin-gift-product-success="1">
        <h1 className="text-lg font-semibold">
          {safeT("gift_admin_product_success_title", {
            fallbackKo: "상품권이 판매 등록되었습니다.",
            fallbackEn: "Gift product is now on sale.",
          })}
        </h1>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/stores/gift-mall" className={`${Sam.btn.primary} inline-flex min-h-[44px] items-center justify-center px-4`}>
            {safeT("gift_admin_cta_mall", {
              fallbackKo: "상품권 몰에서 보기",
              fallbackEn: "View in gift mall",
            })}
          </Link>
          <Link
            href="/admin/gift-certificates/products"
            className="inline-flex min-h-[44px] items-center justify-center rounded-ui-rect border border-sam-border px-4 text-sm font-semibold"
          >
            {safeT("gift_admin_cta_products", {
              fallbackKo: "상품 관리",
              fallbackEn: "Manage products",
            })}
          </Link>
        </div>
      </div>
    );
  }

  if (id && create && detail) {
    const face = Math.trunc(Number(prodFace) || 0);
    const price = Math.trunc(Number(prodPrice) || 0);
    if (prodReview) {
      return (
        <div className="mx-auto max-w-2xl space-y-4 p-4" data-admin-gift-product-review="1">
          <h1 className="text-lg font-semibold">
            {safeT("gift_admin_product_review_title", {
              fallbackKo: "판매 시작 전 확인",
              fallbackEn: "Review before going live",
            })}
          </h1>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm">
            <p>
              {safeT("gift_admin_review_face", {
                fallbackKo: "고객 사용 가능 금액",
                fallbackEn: "Customer face value",
              })}
              : {face.toLocaleString()}
            </p>
            <p>
              {safeT("gift_admin_review_price", {
                fallbackKo: "구매 Point",
                fallbackEn: "Purchase points",
              })}
              : {price.toLocaleString()}
            </p>
            <p>
              {safeT("gift_admin_review_fee", {
                fallbackKo: "플랫폼 수수료율",
                fallbackEn: "Platform fee rate",
              })}
              : {Math.trunc(Number(prodFee) || 0)}%
            </p>
            <p>
              {safeT("gift_admin_review_transfer", {
                fallbackKo: "선물 가능",
                fallbackEn: "Transferable",
              })}
              :{" "}
              {prodTransferable
                ? safeT("gift_admin_yes", { fallbackKo: "예", fallbackEn: "Yes" })
                : safeT("gift_admin_no", { fallbackKo: "아니오", fallbackEn: "No" })}
            </p>
            <p className="mt-2 font-semibold">{prodTitle}</p>
            <p className="text-sam-muted">{detail.store_name}</p>
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
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4" data-admin-gift-product-create="1">
        <h1 className="text-lg font-semibold">
          {safeT("gift_admin_product_create_title", {
            fallbackKo: "상품권 상품 만들기",
            fallbackEn: "Create gift product",
          })}
        </h1>
        <p className="text-sm text-sam-muted">
          {detail.store_name} · {detail.title}
        </p>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <label className="block text-sm">
          <span className="mb-1 block text-sam-muted">
            {safeT("gift_admin_field_title", { fallbackKo: "상품권 이름", fallbackEn: "Gift title" })}
          </span>
          <input
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            value={prodTitle}
            onChange={(e) => setProdTitle(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-sam-muted">
            {safeT("gift_admin_field_face", { fallbackKo: "액면가", fallbackEn: "Face value" })}
          </span>
          <input
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            value={prodFace}
            onChange={(e) => setProdFace(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-sam-muted">
            {safeT("gift_admin_field_price", {
              fallbackKo: "구매가 (Point)",
              fallbackEn: "Purchase price (Points)",
            })}
          </span>
          <input
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            value={prodPrice}
            onChange={(e) => setProdPrice(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-sam-muted">
            {safeT("gift_admin_field_fee", {
              fallbackKo: "플랫폼 수수료 %",
              fallbackEn: "Platform fee %",
            })}
          </span>
          <input
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            value={prodFee}
            onChange={(e) => setProdFee(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-sam-muted">
            {safeT("gift_admin_field_artwork", {
              fallbackKo: "디자인 URL",
              fallbackEn: "Artwork URL",
            })}
          </span>
          <input
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            value={prodImage}
            onChange={(e) => setProdImage(e.target.value)}
          />
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
          onClick={() => router.push(`/admin/gift-certificates/applications?id=${encodeURIComponent(id)}`)}
        >
          {safeT("gift_admin_cta_back", { fallbackKo: "돌아가기", fallbackEn: "Back" })}
        </button>
      </div>
    );
  }

  if (id && detail) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4" data-admin-gift-application-detail="1">
        <h1 className="text-lg font-semibold">
          {safeT("gift_admin_detail_title", {
            fallbackKo: "상품권 판매 신청 검토",
            fallbackEn: "Review gift application",
          })}
        </h1>
        {detail.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={detail.image_url} alt="" className="h-28 w-28 rounded-ui-rect object-cover" />
        ) : null}
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm">
          <p className="font-semibold">{detail.title}</p>
          <p className="text-sam-muted">{detail.store_name}</p>
          <p className="mt-2">Face {detail.requested_face_value.toLocaleString()}</p>
          {detail.requested_purchase_price != null ? (
            <p>Requested price {detail.requested_purchase_price.toLocaleString()}</p>
          ) : null}
          <p className="mt-1 text-sam-muted">Status: {detail.status}</p>
          {detail.design_notes ? (
            <p className="mt-2 whitespace-pre-wrap">{detail.design_notes}</p>
          ) : null}
          {detail.rejection_reason ? (
            <p className="mt-2 text-red-600">{detail.rejection_reason}</p>
          ) : null}
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {detail.status === "submitted" || detail.status === "under_review" || detail.status === "approved" ? (
          <button
            type="button"
            className={`${Sam.btn.primary} min-h-[48px] w-full`}
            onClick={() =>
              router.push(
                `/admin/gift-certificates/applications?id=${encodeURIComponent(id)}&create=1`
              )
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
              {safeT("gift_admin_cta_reject", {
                fallbackKo: "반려",
                fallbackEn: "Reject",
              })}
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
          onClick={() => router.push("/admin/gift-certificates/applications")}
        >
          {safeT("gift_admin_cta_back_list", {
            fallbackKo: "목록으로",
            fallbackEn: "Back to list",
          })}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4" data-admin-gift-applications="1">
      <h1 className="text-lg font-semibold">
        {safeT("gift_admin_list_title", {
          fallbackKo: "상품권 판매 신청",
          fallbackEn: "Gift sale applications",
        })}
      </h1>
      {!loaded ? (
        <p className="text-sm text-sam-muted">…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_admin_empty_apps", {
            fallbackKo: "처리할 신청이 없습니다.",
            fallbackEn: "No applications to review.",
          })}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.title}</p>
                  <p className="text-xs text-sam-muted">
                    {r.store_name || r.store_id} · Face {r.requested_face_value.toLocaleString()} · {r.status}
                  </p>
                  <p className="text-xs text-sam-muted">{r.created_at}</p>
                </div>
                <button
                  type="button"
                  className={`${Sam.btn.primary} shrink-0 px-3 py-2 text-sm`}
                  onClick={() =>
                    router.push(`/admin/gift-certificates/applications?id=${encodeURIComponent(r.id)}`)
                  }
                >
                  {safeT("gift_admin_cta_review", {
                    fallbackKo: "검토",
                    fallbackEn: "Review",
                  })}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
