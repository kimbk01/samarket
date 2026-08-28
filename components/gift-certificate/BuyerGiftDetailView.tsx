"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftVisualCard } from "@/components/gift-certificate/GiftVisualCard";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { useCommerceChildChrome } from "@/lib/delivery/customer/commerce-child-chrome";
import { useUserPointBalance } from "@/hooks/useUserPointBalance";
import type { GiftMallProduct } from "@/lib/gift-certificate/load-gift-mall-products";
import {
  giftPurchaseErrorFallbacks,
  mapGiftPurchaseErrorKey,
} from "@/lib/gift-certificate/map-gift-purchase-error";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { canonicalHubHref } from "@/lib/delivery/customer/commerce-hub-nav";
import { Sam } from "@/lib/ui/sam-component-classes";

type Phase = "detail" | "success";

export function BuyerGiftDetailView({
  productId,
  storeId,
}: {
  productId: string;
  storeId?: string | null;
}) {
  const { safeT } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const from = searchParams.get("from")?.trim() || "";
  const { balance, loading: balanceLoading, refresh: refreshBalance } = useUserPointBalance();
  const [product, setProduct] = useState<GiftMallProduct | null>(null);
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const [authed, setAuthed] = useState(true);
  const [phase, setPhase] = useState<Phase>("detail");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [purchasedGiftNumber, setPurchasedGiftNumber] = useState<string | null>(null);

  const mallHref = storeId
    ? `/stores/gift-mall?storeId=${encodeURIComponent(storeId)}${from ? `&from=${encodeURIComponent(from)}` : ""}`
    : from
      ? `/stores/gift-mall?from=${encodeURIComponent(from)}`
      : "/stores/gift-mall";
  const detailBackHref =
    from === "delivery-activity" ? canonicalHubHref("gifts", { from: "delivery-activity" }) : mallHref;

  useCommerceChildChrome({
    titleKey: phase === "success" ? "gift_u2_success_title" : "gift_u2_detail_title",
    backHref: phase === "success" ? canonicalHubHref("gifts") : detailBackHref,
    preferHistoryBack: true,
  });

  const chargeHref = `/mypage/points/charge?next=${encodeURIComponent(pathname || mallHref)}`;
  const loginHref = `/login?next=${encodeURIComponent(pathname || mallHref)}`;

  const load = useCallback(async () => {
    const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
    const res = await fetch(`/api/me/gift-certificates/mall${qs}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as { ok?: boolean; products?: GiftMallProduct[] };
    let found = (json.ok ? json.products ?? [] : []).find((p) => p.id === productId) ?? null;
    if (!found) {
      const resAll = await fetch(`/api/me/gift-certificates/mall`, {
        credentials: "include",
        cache: "no-store",
      });
      const jsonAll = (await resAll.json()) as { ok?: boolean; products?: GiftMallProduct[] };
      found = (jsonAll.ok ? jsonAll.products ?? [] : []).find((p) => p.id === productId) ?? null;
    }
    setProduct(found);
    setMissing(!found);
    setReady(true);
  }, [productId, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetch("/api/me/points", { credentials: "include", cache: "no-store" }).then((r) => {
      setAuthed(r.status !== 401);
    });
  }, []);

  const enough = useMemo(() => {
    if (!product) return false;
    return balance >= product.purchasePrice;
  }, [balance, product]);

  const shortfall = useMemo(() => {
    if (!product) return 0;
    return Math.max(0, product.purchasePrice - balance);
  }, [balance, product]);

  const afterBalance = useMemo(() => {
    if (!product) return balance;
    return Math.max(0, balance - product.purchasePrice);
  }, [balance, product]);

  const purchase = async () => {
    if (!product || busy) return;
    setBusy(true);
    setErrorMsg(null);
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `gift-purchase-${Date.now()}`;
    try {
      const res = await fetch("/api/me/gift-certificates/purchase", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, idempotencyKey }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        public_gift_number?: string | null;
        publicGiftNumber?: string | null;
      };
      if (res.status === 401 || json.error === "unauthorized") {
        setAuthed(false);
        setConfirmOpen(false);
        const key = mapGiftPurchaseErrorKey("unauthorized");
        setErrorMsg(safeT(key, giftPurchaseErrorFallbacks(key)));
        return;
      }
      if (!json.ok) {
        const key = mapGiftPurchaseErrorKey(json.error);
        setErrorMsg(safeT(key, giftPurchaseErrorFallbacks(key)));
        setConfirmOpen(false);
        if (json.error === "insufficient_balance") {
          void refreshBalance();
        }
        return;
      }
      setPurchasedGiftNumber(
        String(json.publicGiftNumber ?? json.public_gift_number ?? "").trim() || null
      );
      setConfirmOpen(false);
      setPhase("success");
      void refreshBalance();
    } catch {
      const key = mapGiftPurchaseErrorKey("generic");
      setErrorMsg(safeT(key, giftPurchaseErrorFallbacks(key)));
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS} data-gift-detail="1" data-ready="0">
        <div className="flex min-h-[30vh] items-center justify-center text-sm text-sam-muted">…</div>
      </div>
    );
  }

  if (missing || !product) {
    return (
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS} data-gift-detail="1" data-ready="1">
        <p className="text-sm text-sam-muted">
          {safeT("gift_u2_err_not_found", {
            fallbackKo: "상품권을 찾을 수 없습니다.",
            fallbackEn: "Gift certificate not found.",
          })}
        </p>
        <Link
          href={mallHref}
          className={`${Sam.btn.secondary} mt-4 inline-flex min-h-[44px] items-center justify-center px-4`}
        >
          {safeT("gift_u2_detail_browse_other", {
            fallbackKo: "다른 상품권 보기",
            fallbackEn: "Browse other gifts",
          })}
        </Link>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div
        className={APP_MAIN_TAB_SCROLL_BODY_CLASS}
        data-gift-detail="1"
        data-gift-purchase-success="1"
        data-ready="1"
      >
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <GiftVisualCard
            visual={{
              giftScope: product.giftScope,
              imageUrl: product.imageUrl,
              storeLogoUrl: product.storeLogoUrl,
              storeName: product.storeName,
              title: product.title,
            }}
            surface="mall"
            title={product.title}
            issuerName={product.storeName}
            faceValue={product.faceValue}
            purchasePrice={product.purchasePrice}
          />
          {purchasedGiftNumber ? (
            <p className="text-sm text-sam-fg" data-gift-public-number={purchasedGiftNumber}>
              {safeT("gift_u2_public_number_label", {
                fallbackKo: "상품권 번호",
                fallbackEn: "Gift number",
              })}: <span className="tabular-nums font-medium">{purchasedGiftNumber}</span>
            </p>
          ) : null}
          <p className="text-sm text-sam-fg">
            {safeT("gift_u2_success_spent", { fallbackKo: "결제 Point", fallbackEn: "Point spent" })}{" "}
            <span className="tabular-nums font-medium">
              {product.purchasePrice.toLocaleString()}
            </span>
          </p>
        </div>
        <div className="flex flex-col gap-2 pb-8">
          <Link
            href={canonicalHubHref("gifts")}
            prefetch={false}
            className={`${Sam.btn.primary} inline-flex min-h-[48px] items-center justify-center px-4`}
            data-gift-success-wallet-cta="1"
          >
            {safeT("gift_u2_success_wallet_cta", {
              fallbackKo: "내 상품권 보기",
              fallbackEn: "View my gifts",
            })}
          </Link>
          <Link
            href={mallHref}
            prefetch={false}
            className={`${Sam.btn.secondary} inline-flex min-h-[48px] items-center justify-center px-4`}
            data-gift-success-browse-cta="1"
          >
            {safeT("gift_u2_success_browse_cta", {
              fallbackKo: "상품권 더 둘러보기",
              fallbackEn: "Browse more gifts",
            })}
          </Link>
        </div>
      </div>
    );
  }

  const priceLabel = safeT("gift_u2_detail_buy_with_points", {
    fallbackKo: "{price} Point로 구매",
    fallbackEn: "Buy for {price} Point",
    vars: { price: product.purchasePrice.toLocaleString() },
  });

  return (
    <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS} data-gift-detail="1" data-ready="1">
      <GiftVisualCard
        className="mb-4"
        visual={{
          giftScope: product.giftScope,
          imageUrl: product.imageUrl,
          storeLogoUrl: product.storeLogoUrl,
          storeName: product.storeName,
          title: product.title,
        }}
        surface="mall"
        title={product.title}
        issuerName={product.storeName}
        faceValue={product.faceValue}
        purchasePrice={product.purchasePrice}
      />

      <div className="mb-4 min-w-0 space-y-1">
        <p className="text-sm text-sam-muted">
          {safeT("gift_u2_detail_unit", {
            fallbackKo: "구매 단위 1장",
            fallbackEn: "Sold per certificate",
          })}
        </p>
        <p className="text-sm text-sam-muted">
          {product.transferable
            ? safeT("gift_u2_mall_transferable", {
                fallbackKo: "선물 가능",
                fallbackEn: "Transferable",
              })
            : safeT("gift_u2_mall_non_transferable", {
                fallbackKo: "선물 불가",
                fallbackEn: "Non-transferable",
              })}
        </p>
        <p className="text-sm text-sam-fg">
          {safeT("gift_u2_detail_usable_store", {
            fallbackKo: "사용 가능 매장",
            fallbackEn: "Usable at",
          })}
          : {product.storeName}
        </p>
        {product.salesEndsAt ? (
          <p className="text-xs text-sam-muted">
            {safeT("gift_u2_detail_sales_ends", {
              fallbackKo: "판매 종료",
              fallbackEn: "Sales end",
            })}
            : {new Date(product.salesEndsAt).toLocaleString()}
          </p>
        ) : null}
        <p className="text-sm font-medium text-sam-fg">
          {safeT("gift_u2_detail_no_expiry", {
            fallbackKo: "상품권 잔액은 만료되지 않습니다.",
            fallbackEn: "Gift certificate balances never expire.",
          })}
        </p>
        <p className="text-xs text-sam-muted">
          {safeT("gift_u2_detail_terms", {
            fallbackKo:
              "상품권은 D-Point로만 구매할 수 있습니다. 구매 후 잔액은 해당 매장 주문에서 사용할 수 있습니다.",
            fallbackEn:
              "Gift certificates can only be purchased with D-Point. Remaining balance can be used at this store’s orders.",
          })}
        </p>
      </div>

      <div
        className="mb-4 rounded-ui-rect border border-sam-border bg-sam-surface p-3"
        data-gift-point-panel="1"
      >
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-sam-muted">
            {safeT("gift_u2_detail_balance_label", {
              fallbackKo: "보유 D-Point",
              fallbackEn: "Your D-Point",
            })}
          </span>
          <span className="tabular-nums font-semibold text-sam-fg">
            {balanceLoading ? "…" : balance.toLocaleString()}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-sm">
          <span className="text-sam-muted">
            {safeT("gift_u2_detail_need_label", {
              fallbackKo: "구매 필요",
              fallbackEn: "Required",
            })}
          </span>
          <span className="tabular-nums font-semibold text-sam-fg">
            {product.purchasePrice.toLocaleString()}
          </span>
        </div>
        {!enough && authed ? (
          <p className="mt-2 text-sm text-sam-danger">
            {safeT("gift_u2_detail_shortfall", {
              fallbackKo: "{shortfall} Point가 부족합니다.",
              fallbackEn: "You need {shortfall} more Point.",
              vars: { shortfall: shortfall.toLocaleString() },
            })}
          </p>
        ) : null}
      </div>

      {errorMsg ? <p className="mb-3 text-sm text-sam-danger">{errorMsg}</p> : null}

      <div className="flex flex-col gap-2 pb-10">
        {!authed ? (
          <Link
            href={loginHref}
            className={`${Sam.btn.primary} inline-flex min-h-[48px] items-center justify-center px-4`}
            data-gift-detail-login-cta="1"
          >
            {safeT("gift_u2_detail_login_cta", {
              fallbackKo: "로그인하고 구매",
              fallbackEn: "Sign in to buy",
            })}
          </Link>
        ) : enough ? (
          <button
            type="button"
            className={`${Sam.btn.primary} min-h-[52px] px-4 text-base font-semibold`}
            data-gift-detail-buy-cta="1"
            disabled={busy || balanceLoading}
            onClick={() => {
              setErrorMsg(null);
              setConfirmOpen(true);
            }}
          >
            {safeT("commerce_hub_gift_buy_cta", {
              fallbackKo: "상품권 구매하기",
              fallbackEn: "Buy gift certificate",
            })}
            {" · "}
            {priceLabel}
          </button>
        ) : (
          <>
            <p className="text-sm font-medium text-sam-fg">
              {safeT("gift_u2_detail_insufficient_title", {
                fallbackKo: "Point가 부족합니다",
                fallbackEn: "Not enough Point",
              })}
            </p>
            <Link
              href={chargeHref}
              className={`${Sam.btn.primary} inline-flex min-h-[48px] items-center justify-center px-4`}
              data-gift-detail-charge-cta="1"
            >
              {safeT("gift_u2_detail_charge_cta", {
                fallbackKo: "Point 충전하기",
                fallbackEn: "Top up Point",
              })}
            </Link>
            <Link
              href={mallHref}
              className={`${Sam.btn.secondary} inline-flex min-h-[48px] items-center justify-center px-4`}
              data-gift-detail-browse-cta="1"
            >
              {safeT("gift_u2_detail_browse_other", {
                fallbackKo: "다른 상품권 보기",
                fallbackEn: "Browse other gifts",
              })}
            </Link>
          </>
        )}
      </div>

      <DibayBottomSheet
        open={confirmOpen}
        onClose={() => {
          if (!busy) setConfirmOpen(false);
        }}
        title={safeT("gift_u2_confirm_title", {
          fallbackKo: "구매 확인",
          fallbackEn: "Confirm purchase",
        })}
        footer={
          <div className="flex gap-2 px-4 pb-4">
            <button
              type="button"
              className={`${Sam.btn.secondary} min-h-[48px] flex-1`}
              disabled={busy}
              onClick={() => setConfirmOpen(false)}
            >
              {safeT("gift_u2_confirm_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" })}
            </button>
            <button
              type="button"
              className={`${Sam.btn.primary} min-h-[48px] flex-1`}
              disabled={busy}
              data-gift-confirm-submit="1"
              onClick={() => void purchase()}
            >
              {busy
                ? safeT("gift_u2_confirm_pending", {
                    fallbackKo: "구매 중…",
                    fallbackEn: "Purchasing…",
                  })
                : safeT("gift_u2_confirm_submit", {
                    fallbackKo: "구매 확정",
                    fallbackEn: "Confirm purchase",
                  })}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 px-4 pb-2">
          <GiftVisualCard
            visual={{
              giftScope: product.giftScope,
              imageUrl: product.imageUrl,
              storeLogoUrl: product.storeLogoUrl,
              storeName: product.storeName,
              title: product.title,
            }}
            surface="mall"
            title={product.title}
            issuerName={product.storeName}
            faceValue={product.faceValue}
            purchasePrice={product.purchasePrice}
          />
          <div className="flex justify-between text-sm">
            <span className="text-sam-muted">
              {safeT("gift_u2_detail_balance_label", {
                fallbackKo: "보유 D-Point",
                fallbackEn: "Your D-Point",
              })}
            </span>
            <span className="tabular-nums font-medium">{balance.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-sam-muted">
              {safeT("gift_u2_confirm_after_balance", {
                fallbackKo: "구매 후 예상 Point",
                fallbackEn: "Point after purchase",
              })}
            </span>
            <span className="tabular-nums font-medium">{afterBalance.toLocaleString()}</span>
          </div>
        </div>
      </DibayBottomSheet>
    </div>
  );
}
