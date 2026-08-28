"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftVisualCard } from "@/components/gift-certificate/GiftVisualCard";
import { DibayDialog } from "@/components/ui/dibay-overlay";
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

/** Gift detail primary CTA — solid fill; utility/layer classes can resolve transparent under `.delivery-ui`. */
const GIFT_DETAIL_BUY_BTN_STYLE = {
  backgroundColor: "var(--delivery-primary, var(--dibay-green, #0B421A))",
  color: "var(--dibay-cream, #fffdf8)",
} as const;

const GIFT_DETAIL_BUY_BTN_CLASS =
  "inline-flex min-h-[52px] w-full touch-manipulation select-none items-center justify-center rounded-ui-rect border-0 px-4 text-[15px] font-bold leading-tight disabled:cursor-not-allowed disabled:opacity-45";

export function BuyerGiftDetailView({
  productId,
  storeId,
}: {
  productId: string;
  storeId?: string | null;
}) {
  const { safeT } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const from = searchParams.get("from")?.trim() || "";
  const { balance, loading: balanceLoading, refresh: refreshBalance } = useUserPointBalance();
  const [product, setProduct] = useState<GiftMallProduct | null>(null);
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const [authed, setAuthed] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
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
    titleKey: "gift_u2_detail_title",
    backHref: detailBackHref,
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

  const productDisplayTitle = useMemo(() => product?.title ?? "", [product]);

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
      setSuccessOpen(true);
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

  const priceLabel = safeT("gift_u2_detail_buy_with_points", {
    fallbackKo: "{price} Point로 구매",
    fallbackEn: "Buy for {price} Point",
    vars: { price: product.purchasePrice.toLocaleString() },
  });
  const confirmBody = safeT("gift_u2_confirm_body", {
    fallbackKo: "{title} · {price} Point를 결제합니다.\n구매 후 예상 잔액은 {after} Point입니다.",
    fallbackEn: "Pay {price} Point for {title}.\nEstimated balance after purchase: {after} Point.",
    vars: {
      title: productDisplayTitle || product.storeName,
      price: product.purchasePrice.toLocaleString(),
      after: afterBalance.toLocaleString(),
    },
  });
  const successBody = purchasedGiftNumber
    ? safeT("gift_u2_success_dialog_body", {
        fallbackKo: "결제 Point {price}\n상품권 번호 {number}",
        fallbackEn: "Point spent {price}\nGift number {number}",
        vars: {
          price: product.purchasePrice.toLocaleString(),
          number: purchasedGiftNumber,
        },
      })
    : safeT("gift_u2_success_dialog_body_no_number", {
        fallbackKo: "결제 Point {price}",
        fallbackEn: "Point spent {price}",
        vars: { price: product.purchasePrice.toLocaleString() },
      });

  return (
    <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS} data-gift-detail="1" data-ready="1">
      <GiftVisualCard
        className="mb-3"
        visual={{
          giftScope: product.giftScope,
          imageUrl: product.imageUrl,
          storeLogoUrl: product.storeLogoUrl,
          storeName: product.storeName,
          title: productDisplayTitle,
        }}
        surface="mall"
        title={productDisplayTitle}
        issuerName={product.storeName}
        faceValue={product.faceValue}
        purchasePrice={product.purchasePrice}
      />

      {/* Solid inline fill — sam-btn-primary / delivery-btn-primary can paint transparent here. */}
      <div className="mb-4 flex flex-col gap-2" data-gift-detail-cta-bar="1">
        {!authed ? (
          <Link
            href={loginHref}
            className={GIFT_DETAIL_BUY_BTN_CLASS}
            style={GIFT_DETAIL_BUY_BTN_STYLE}
            data-gift-detail-login-cta="1"
          >
            {safeT("gift_u2_detail_login_cta", {
              fallbackKo: "로그인하고 구매",
              fallbackEn: "Sign in to buy",
            })}
          </Link>
        ) : (
          <>
            <button
              type="button"
              className={GIFT_DETAIL_BUY_BTN_CLASS}
              style={GIFT_DETAIL_BUY_BTN_STYLE}
              data-gift-detail-buy-cta="1"
              disabled={busy || balanceLoading || !enough}
              onClick={() => {
                if (!enough) return;
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
            {!enough ? (
              <Link
                href={chargeHref}
                className={GIFT_DETAIL_BUY_BTN_CLASS}
                style={GIFT_DETAIL_BUY_BTN_STYLE}
                data-gift-detail-charge-cta="1"
              >
                {safeT("gift_u2_detail_charge_cta", {
                  fallbackKo: "Point 충전하기",
                  fallbackEn: "Top up Point",
                })}
              </Link>
            ) : null}
          </>
        )}
        {errorMsg ? <p className="text-sm text-sam-danger">{errorMsg}</p> : null}
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

      <div className="mb-8 min-w-0 space-y-1">
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

      <DibayDialog
        open={confirmOpen}
        onClose={() => {
          if (!busy) setConfirmOpen(false);
        }}
        dismissible={!busy}
        title={safeT("gift_u2_confirm_title", {
          fallbackKo: "구매 확인",
          fallbackEn: "Confirm purchase",
        })}
        description={confirmBody}
      >
        <div className="mt-3 space-y-3" data-gift-confirm-dialog="1">
          <GiftVisualCard
            visual={{
              giftScope: product.giftScope,
              imageUrl: product.imageUrl,
              storeLogoUrl: product.storeLogoUrl,
              storeName: product.storeName,
              title: productDisplayTitle,
            }}
            surface="mall"
            compact
            title={productDisplayTitle}
            issuerName={product.storeName}
            faceValue={product.faceValue}
            purchasePrice={product.purchasePrice}
          />
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="dibay-overlay-btn dibay-overlay-btn--secondary min-h-[48px] flex-1"
              disabled={busy}
              onClick={() => setConfirmOpen(false)}
            >
              {safeT("gift_u2_confirm_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" })}
            </button>
            <button
              type="button"
              className="dibay-overlay-btn dibay-overlay-btn--primary min-h-[48px] flex-1"
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
        </div>
      </DibayDialog>

      <DibayDialog
        open={successOpen}
        onClose={() => {
          setSuccessOpen(false);
          router.push(mallHref);
        }}
        dismissible
        title={safeT("gift_u2_success_title", {
          fallbackKo: "상품권 구매가 완료되었습니다.",
          fallbackEn: "Gift certificate purchased.",
        })}
        description={successBody}
      >
        <div className="mt-3 space-y-3" data-gift-purchase-success="1">
          {purchasedGiftNumber ? (
            <p
              className="text-sm tabular-nums text-sam-fg"
              data-gift-public-number={purchasedGiftNumber}
            >
              {purchasedGiftNumber}
            </p>
          ) : null}
          <div className="flex gap-2">
          <button
            type="button"
            className="dibay-overlay-btn dibay-overlay-btn--secondary min-h-[48px] flex-1"
            data-gift-success-browse-cta="1"
            onClick={() => {
              setSuccessOpen(false);
              router.push(mallHref);
            }}
          >
            {safeT("gift_u2_success_browse_cta", {
              fallbackKo: "상품권 더 둘러보기",
              fallbackEn: "Browse more gifts",
            })}
          </button>
          <button
            type="button"
            className="dibay-overlay-btn dibay-overlay-btn--primary min-h-[48px] flex-1"
            data-gift-success-wallet-cta="1"
            onClick={() => {
              setSuccessOpen(false);
              router.push(canonicalHubHref("gifts"));
            }}
          >
            {safeT("gift_u2_success_wallet_cta", {
              fallbackKo: "내 상품권 보기",
              fallbackEn: "View my gifts",
            })}
          </button>
          </div>
        </div>
      </DibayDialog>
    </div>
  );
}
