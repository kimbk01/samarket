"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftSalesDateTimeField } from "@/components/gift-certificate/GiftSalesDateTimeField";
import { dibayAlert, dibayConfirm } from "@/components/ui/dibay-overlay";
import { buildAdminGiftOpsHref } from "@/lib/gift-certificate/admin-gift-ops-tabs";
import {
  validateGiftProductFunding,
  type GiftDiscountFundingParty,
} from "@/lib/gift-certificate/gift-certificate-domain-contract";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  ADMIN_GIFT_PRIMARY_BTN_STYLE,
  adminGiftPrimaryBtnClass,
} from "@/lib/gift-certificate/admin-gift-primary-button";
import { Sam } from "@/lib/ui/css-vars";
import { useRouter } from "next/navigation";

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
  const { safeT } = useI18n();
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
          safeT("gift_ops_image_upload_fail", {
            fallbackKo: "이미지 업로드에 실패했습니다.",
            fallbackEn: "Image upload failed.",
          })
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
    const confirmed = await dibayConfirm({
      title: safeT("gift_admin_register_confirm_title", {
        fallbackKo: "상품권을 등록할까요?",
        fallbackEn: "Register this gift product?",
      }),
      description: safeT("gift_admin_register_confirm_body", {
        fallbackKo:
          "확인을 누르면 초안 상품이 등록됩니다. 판매는 상품 상세에서 [판매 시작]으로 시작합니다. 취소하면 등록되지 않습니다.",
        fallbackEn:
          "Confirm to create a draft product. Selling starts only after [Start selling] on product detail. Cancel leaves it unregistered.",
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
          safeT("gift_ops_create_fail", {
            fallbackKo: "상품권 상품을 만들지 못했습니다.",
            fallbackEn: "Couldn’t create gift product.",
          })
        );
        return;
      }
      await dibayAlert({
        title: safeT("gift_admin_product_success_title", {
          fallbackKo: "초안 상품이 등록되었습니다. 판매는 상품 상세에서 시작합니다.",
          fallbackEn: "Draft product registered. Start selling from product detail.",
        }),
        confirmLabel: safeT("gift_admin_product_success_ok", {
          fallbackKo: "확인",
          fallbackEn: "OK",
        }),
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
        <h2 className="text-lg font-semibold text-sam-fg">
          {safeT("gift_ops_create_choose_prompt", {
            fallbackKo: "어떤 상품권을 만드시겠습니까?",
            fallbackEn: "Which gift will you create?",
          })}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="text-base font-semibold">
              {safeT("gift_ops_type_store", { fallbackKo: "매장 상품권", fallbackEn: "Store Gift" })}
            </p>
            <p className="text-sm text-sam-muted">
              {safeT("gift_ops_type_store_desc", {
                fallbackKo: "특정 매장에서만 사용할 수 있는 상품권입니다.",
                fallbackEn: "Redeemable only at the selected store.",
              })}
            </p>
            <button
              type="button"
              className={adminGiftPrimaryBtnClass("mt-auto min-h-[48px] w-full")}
              style={ADMIN_GIFT_PRIMARY_BTN_STYLE}
              onClick={() => go({ create: "1", type: "STORE" })}
            >
              {safeT("gift_ops_cta_make_store", {
                fallbackKo: "매장 상품권 만들기",
                fallbackEn: "Create Store Gift",
              })}
            </button>
          </div>
          <div className="flex flex-col gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="text-base font-semibold">
              {safeT("gift_ops_type_platform", { fallbackKo: "DIBAY 상품권", fallbackEn: "DIBAY Gift" })}
            </p>
            <p className="text-sm text-sam-muted">
              {safeT("gift_ops_type_platform_desc", {
                fallbackKo: "DIBAY 이용 가능 매장에서 사용할 수 있는 플랫폼 상품권입니다.",
                fallbackEn: "Usable at DIBAY eligible stores.",
              })}
            </p>
            <button
              type="button"
              className={adminGiftPrimaryBtnClass("mt-auto min-h-[48px] w-full")}
              style={ADMIN_GIFT_PRIMARY_BTN_STYLE}
              onClick={() => go({ create: "1", type: "PLATFORM" })}
            >
              {safeT("gift_ops_cta_make_platform", {
                fallbackKo: "DIBAY 상품권 만들기",
                fallbackEn: "Create DIBAY Gift",
              })}
            </button>
          </div>
        </div>
        <button
          type="button"
          className="min-h-[44px] w-full rounded-ui-rect border border-sam-border text-sm font-semibold"
          onClick={() => go({ create: null, type: null })}
        >
          {safeT("gift_admin_cta_back", { fallbackKo: "돌아가기", fallbackEn: "Back" })}
        </button>
      </section>
    );
  }

  const scopeLabel =
    mode === "PLATFORM"
      ? safeT("gift_ops_type_platform", { fallbackKo: "DIBAY 상품권", fallbackEn: "DIBAY Gift" })
      : safeT("gift_ops_type_store", { fallbackKo: "매장 상품권", fallbackEn: "Store Gift" });

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold text-sam-fg">
          {mode === "PLATFORM"
            ? safeT("gift_ops_create_platform_title", {
                fallbackKo: "새 DIBAY 상품권 만들기",
                fallbackEn: "Create DIBAY Gift",
              })
            : safeT("gift_ops_create_store_title", {
                fallbackKo: "새 매장 상품권 만들기",
                fallbackEn: "Create Store Gift",
              })}
        </h2>
        <p className="mt-1 text-sm text-sam-muted">
          {mode === "PLATFORM"
            ? safeT("gift_ops_type_platform_desc", {
                fallbackKo: "DIBAY 이용 가능 매장에서 사용할 수 있는 플랫폼 상품권입니다.",
                fallbackEn: "Usable at DIBAY eligible stores.",
              })
            : safeT("gift_ops_type_store_desc", {
                fallbackKo: "선택한 매장에서만 사용할 수 있는 상품권입니다.",
                fallbackEn: "Redeemable only at the selected store.",
              })}
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
        {safeT("gift_ops_preview_title", { fallbackKo: "상품권 미리보기", fallbackEn: "Gift preview" })}
      </p>
      <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app">
        {imageUrl ? (
          // Thumbnail not used: remote admin upload URL preview
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-36 w-full object-cover" />
        ) : (
          <div className="flex h-36 items-center justify-center bg-sam-muted/20 text-xs text-sam-muted">
            {safeT("gift_ops_preview_no_image", { fallbackKo: "이미지 없음", fallbackEn: "No image" })}
          </div>
        )}
        <div className="space-y-1 p-3">
          <p className="text-lg font-bold tabular-nums">{formatMoneyPhp(faceN || 0)}</p>
          <p className="text-sm font-semibold">{title.trim() || "—"}</p>
          <p className="text-xs text-sam-muted">
            {mode === "PLATFORM"
              ? safeT("gift_ops_usable_platform_short", {
                  fallbackKo: "DIBAY 이용 가능 매장",
                  fallbackEn: "DIBAY eligible stores",
                })
              : selected?.storeName ||
                safeT("gift_ops_select_store", { fallbackKo: "매장 선택", fallbackEn: "Select store" })}
          </p>
        </div>
      </div>
      <div className="space-y-1 text-sm">
        <p className="font-semibold">
          {safeT("gift_ops_settle_preview_title", {
            fallbackKo: "예상 정산 예시",
            fallbackEn: "Settlement preview (example)",
          })}
        </p>
        <p className="text-xs text-sam-muted">
          {safeT("gift_ops_settle_preview_note", {
            fallbackKo: "표시용 예시입니다. 실제 정산은 사용·주문 완료 후 확정됩니다.",
            fallbackEn: "Presentation only. Canonical recognition is after completed order.",
          })}
        </p>
        <p className="tabular-nums">
          {safeT("gift_ops_settle_use", { fallbackKo: "사용액", fallbackEn: "Redeemed" })}{" "}
          {formatMoneyPhp(preview.gross)}
        </p>
        <p className="tabular-nums">
          DIBAY {preview.fee}% → {formatMoneyPhp(preview.dibay)}
        </p>
        <p className="tabular-nums font-semibold">
          {safeT("gift_ops_settle_merchant", { fallbackKo: "매장 정산 예정", fallbackEn: "Merchant net" })}{" "}
          {formatMoneyPhp(preview.merchant)}
        </p>
        {mode === "PLATFORM" ? (
          <p className="text-xs text-sam-muted">
            {safeT("gift_ops_platform_settle_note", {
              fallbackKo: "실제 사용된 매장이 주문 완료 후 매장 정산 대상이 됩니다.",
              fallbackEn: "The redemption store is the settlement merchant after order completion.",
            })}
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
                {safeT("gift_ops_field_type", { fallbackKo: "종류", fallbackEn: "Type" })}:{" "}
              </span>
              {scopeLabel}
            </p>
            {mode === "STORE" ? (
              <p>
                <span className="text-sam-muted">
                  {safeT("gift_ops_usable_label", { fallbackKo: "사용 가능 매장", fallbackEn: "Usable stores" })}:{" "}
                </span>
                {selected?.storeName}
              </p>
            ) : (
              <p>
                <span className="text-sam-muted">
                  {safeT("gift_ops_usable_label", { fallbackKo: "사용 가능 매장", fallbackEn: "Usable stores" })}:{" "}
                </span>
                {safeT("gift_ops_usable_platform_short", {
                  fallbackKo: "DIBAY 이용 가능 매장",
                  fallbackEn: "DIBAY eligible stores",
                })}
              </p>
            )}
            <p className="font-semibold">{title}</p>
            <p className="tabular-nums">
              {safeT("gift_ops_field_face_amount", { fallbackKo: "표시 금액", fallbackEn: "Display amount" })}{" "}
              {formatMoneyPhp(faceN)} ·{" "}
              {safeT("gift_ops_field_purchase", { fallbackKo: "판매 가격", fallbackEn: "Sale price" })}{" "}
              {formatMoneyPhp(priceN)} · Fee {feeN}%
            </p>
            <p className="tabular-nums text-sam-muted">
              {safeT("gift_ops_settle_preview_title", {
                fallbackKo: "예상 정산 예시",
                fallbackEn: "Settlement preview",
              })}
              : {formatMoneyPhp(preview.gross)} → DIBAY {formatMoneyPhp(preview.dibay)} →{" "}
              {formatMoneyPhp(preview.merchant)}
            </p>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse">
              <button
                type="button"
                className={adminGiftPrimaryBtnClass("min-h-[48px] flex-1")}
                style={ADMIN_GIFT_PRIMARY_BTN_STYLE}
                disabled={busy}
                data-admin-gift-create-start="1"
                onClick={() => void startSale()}
              >
                {mode === "PLATFORM"
                  ? safeT("gift_ops_cta_start_platform", {
                      fallbackKo: "DIBAY 상품권 판매 시작",
                      fallbackEn: "Start selling DIBAY Gift",
                    })
                  : safeT("gift_ops_cta_start_sale", {
                      fallbackKo: "상품권 판매 시작",
                      fallbackEn: "Start selling",
                    })}
              </button>
              <button
                type="button"
                className="min-h-[48px] flex-1 rounded-ui-rect border border-sam-border text-sm font-semibold"
                onClick={() => setReview(false)}
              >
                {safeT("gift_ops_cta_edit", { fallbackKo: "수정하기", fallbackEn: "Edit" })}
              </button>
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
                {safeT("gift_ops_sec_store", { fallbackKo: "사용 매장", fallbackEn: "Redeem store" })}
              </h3>
              <label className="block space-y-1 text-sm">
                <span>
                  {safeT("gift_ops_store_search", {
                    fallbackKo: "매장 검색 또는 선택",
                    fallbackEn: "Search or select store",
                  })}
                </span>
                <input
                  className={Sam.input.base}
                  value={storeQuery}
                  onChange={(e) => setStoreQuery(e.target.value)}
                  placeholder={safeT("gift_ops_store_search_ph", {
                    fallbackKo: "매장명, Owner, Store ID",
                    fallbackEn: "Store name, owner, store id",
                  })}
                />
              </label>
              {storeLoading ? (
                <p className="text-xs text-sam-muted">{safeT("gift_ops_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}</p>
              ) : null}
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {storeHits.map((st) => (
                  <li key={st.storeId}>
                    <button
                      type="button"
                      className={[
                        "w-full rounded-ui-rect border px-3 py-2 text-left text-sm",
                        selected?.storeId === st.storeId
                          ? "border-sam-fg bg-sam-app"
                          : "border-sam-border bg-sam-app",
                      ].join(" ")}
                      onClick={() => setSelected(st)}
                    >
                      <span className="font-semibold">{st.storeName || st.storeId}</span>
                      <span className="mt-0.5 block text-xs text-sam-muted">
                        {st.ownerLabel || "—"} · {st.categoryName || st.businessType || "—"} ·{" "}
                        {st.approvalStatus || "—"}
                      </span>
                    </button>
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
                    {safeT("gift_ops_store_only_scope", {
                      fallbackKo: `이 상품권은 "${selected.storeName}"에서만 사용할 수 있습니다.`,
                      fallbackEn: `This gift is usable only at "${selected.storeName}".`,
                    })}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-sam-muted">{selected.storeId}</p>
                </div>
              ) : null}
            </section>
          ) : (
            <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <h3 className="text-sm font-semibold">
                {safeT("gift_ops_sec_scope", { fallbackKo: "사용 범위", fallbackEn: "Usable scope" })}
              </h3>
              <p className="text-sm">
                {safeT("gift_ops_usable_platform_short", {
                  fallbackKo: "DIBAY 이용 가능 매장",
                  fallbackEn: "DIBAY eligible stores",
                })}
              </p>
              <p className="text-xs text-sam-muted">
                {safeT("gift_ops_platform_scope_note", {
                  fallbackKo:
                    "차단·정지·이용 불가 매장은 제외됩니다. “모든 매장”이 아닙니다.",
                  fallbackEn:
                    "Blocked/suspended/ineligible stores are excluded — not literally every store.",
                })}
              </p>
            </section>
          )}

          <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h3 className="text-sm font-semibold">
              {safeT("gift_ops_sec_basic", { fallbackKo: "상품권 기본 정보", fallbackEn: "Basics" })}
            </h3>
            <label className="block space-y-1 text-sm">
              <span>
                {safeT("gift_admin_field_title", { fallbackKo: "상품권 이름", fallbackEn: "Gift title" })}
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
                {safeT("gift_ops_field_image_upload", {
                  fallbackKo: "상품권 이미지",
                  fallbackEn: "Gift image",
                })}
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
                  {safeT("gift_ops_uploading", { fallbackKo: "업로드 중…", fallbackEn: "Uploading…" })}
                </p>
              ) : null}
            </div>
          </section>

          <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h3 className="text-sm font-semibold">
              {safeT("gift_ops_sec_amount", { fallbackKo: "금액", fallbackEn: "Amount" })}
            </h3>
            <label className="block space-y-1 text-sm">
              <span>
                {safeT("gift_ops_field_face_amount", {
                  fallbackKo: "표시 금액",
                  fallbackEn: "Display amount",
                })}
              </span>
              <input className={Sam.input.base} inputMode="numeric" value={face} onChange={(e) => setFace(e.target.value)} />
              <span className="text-xs text-sam-muted">
                {safeT("gift_ops_face_help", {
                  fallbackKo: "고객이 사용할 수 있는 상품권 가치",
                  fallbackEn: "Value the customer can redeem",
                })}
              </span>
            </label>
            <label className="block space-y-1 text-sm">
              <span>
                {safeT("gift_ops_field_purchase", { fallbackKo: "판매 가격", fallbackEn: "Sale price" })}
              </span>
              <input className={Sam.input.base} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
              <span className="text-xs text-sam-muted">
                {safeT("gift_ops_purchase_help", {
                  fallbackKo: "고객이 Point로 구매할 가격",
                  fallbackEn: "Price paid with Point",
                })}
              </span>
            </label>
            {promoGap > 0 ? (
              <label className="block space-y-1 text-sm">
                <span>
                  {safeT("gift_ops_field_promo_funding", {
                    fallbackKo: "할인 부담",
                    fallbackEn: "Discount funding",
                  })}
                </span>
                <select
                  className={Sam.input.base}
                  value={discountFundingParty}
                  onChange={(e) =>
                    setDiscountFundingParty(e.target.value as GiftDiscountFundingParty)
                  }
                >
                  <option value="MERCHANT">
                    {safeT("gift_ops_funding_merchant", {
                      fallbackKo: "매장 부담",
                      fallbackEn: "Merchant funded",
                    })}
                  </option>
                  <option value="PLATFORM">
                    {safeT("gift_ops_funding_platform", {
                      fallbackKo: "DIBAY 부담",
                      fallbackEn: "DIBAY funded",
                    })}
                  </option>
                  <option value="SHARED">
                    {safeT("gift_ops_funding_shared", {
                      fallbackKo: "분담 (SHARED)",
                      fallbackEn: "Shared",
                    })}
                  </option>
                </select>
                <span className="text-xs text-sam-muted tabular-nums">
                  {safeT("gift_ops_promo_gap_label", {
                    vars: { gap: formatMoneyPhp(promoGap) },
                    fallbackKo: `할인 ${formatMoneyPhp(promoGap)} · 구매 시 Ledger C accrual`,
                    fallbackEn: `Discount ${formatMoneyPhp(promoGap)} · Ledger C accrual at purchase`,
                  })}
                </span>
              </label>
            ) : null}
          </section>

          <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h3 className="text-sm font-semibold">
              {safeT("gift_ops_sec_fee", { fallbackKo: "수수료·정산", fallbackEn: "Fee & settlement" })}
            </h3>
            <label className="block space-y-1 text-sm">
              <span>
                {safeT("gift_ops_field_fee_dibay", {
                  fallbackKo: "DIBAY 수수료 %",
                  fallbackEn: "DIBAY fee %",
                })}
              </span>
              <input className={Sam.input.base} inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} />
            </label>
          </section>

          <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h3 className="text-sm font-semibold">
              {safeT("gift_ops_sec_sales", { fallbackKo: "판매 설정", fallbackEn: "Sales settings" })}
            </h3>
            <GiftSalesDateTimeField
              label={safeT("gift_ops_field_sales_start", { fallbackKo: "판매 시작", fallbackEn: "Sales start" })}
              value={salesStart}
              onChange={setSalesStart}
              allowEmpty={false}
              data-testid="create-start"
            />
            <GiftSalesDateTimeField
              label={safeT("gift_ops_field_sales_end", { fallbackKo: "판매 종료", fallbackEn: "Sales end" })}
              value={salesEnd}
              onChange={setSalesEnd}
              data-testid="create-end"
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={transferable} onChange={(e) => setTransferable(e.target.checked)} />
              {safeT("gift_admin_field_transferable", { fallbackKo: "선물 가능", fallbackEn: "Transferable" })}
            </label>
          </section>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="sticky bottom-0 z-20 -mx-1 flex flex-col gap-2 border-t border-sam-border bg-sam-app/95 p-3 backdrop-blur-sm sm:flex-row-reverse">
            <button
              type="button"
              className={adminGiftPrimaryBtnClass("min-h-[48px] flex-1")}
              style={ADMIN_GIFT_PRIMARY_BTN_STYLE}
              disabled={!canReview}
              data-admin-gift-create-review="1"
              onClick={() => setReview(true)}
            >
              {safeT("gift_admin_cta_review_product", {
                fallbackKo: "판매 내용 확인",
                fallbackEn: "Review details",
              })}
            </button>
            <button
              type="button"
              className="min-h-[48px] flex-1 rounded-ui-rect border border-sam-border text-sm font-semibold"
              onClick={() => go({ create: "1", type: null })}
            >
              {safeT("gift_admin_cta_back", { fallbackKo: "종류 다시 선택", fallbackEn: "Change type" })}
            </button>
          </div>
        </div>
        {previewCard}
      </div>
    </section>
  );
}
