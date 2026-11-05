"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CurrencyAmount } from "@/components/currency";
import { GiftVisualCard } from "@/components/gift-certificate/GiftVisualCard";
import { DibayDialog, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useCommerceChildChrome } from "@/lib/delivery/customer/commerce-child-chrome";
import { useUserPointBalance } from "@/hooks/useUserPointBalance";
import type { GiftMallProduct } from "@/lib/gift-certificate/load-gift-mall-products";
import { formatGiftProductExpirationDisplay } from "@/lib/gift-certificate/format-gift-certificate-expiration";
import {
  giftPurchaseErrorFallbacks,
  mapGiftPurchaseErrorKey,
  readGiftPurchaseErrorAmounts,
} from "@/lib/gift-certificate/map-gift-purchase-error";
import { formatMoneyPhp } from "@/lib/utils/format";
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
  const {
    balance,
    appleOnly,
    generalAvailable,
    loading: balanceLoading,
    refresh: refreshBalance,
  } = useUserPointBalance();
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
    const res = await fetch(`/api/me/gift-certificates/mall/${encodeURIComponent(productId)}${qs}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as {
      ok?: boolean;
      product?: GiftMallProduct;
      error?: string;
      reason?: string;
    };
    if (res.ok && json.ok && json.product?.id === productId) {
      setProduct(json.product);
      setMissing(false);
    } else {
      setProduct(null);
      setMissing(true);
    }
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
    return generalAvailable >= product.purchasePrice;
  }, [generalAvailable, product]);

  const shortfall = useMemo(() => {
    if (!product) return 0;
    return Math.max(0, product.purchasePrice - generalAvailable);
  }, [generalAvailable, product]);

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
        setErrorMsg(safeT(key, giftPurchaseErrorFallbacks(key, readGiftPurchaseErrorAmounts(json))));
        setConfirmOpen(false);
        if (json.error === "insufficient_balance" || json.error === "point_apple_funds_restricted") {
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

  const noExpiryLabel = safeT("gift_portrait_expiry_none", {
    fallbackKo: "만료 없음",
    fallbackEn: "No expiry",
  });
  const expirationDisplay = formatGiftProductExpirationDisplay({
    expiryPolicy: product.expiryPolicy,
    validityDays: product.validityDays,
    fixedValidUntil: product.fixedValidUntil,
    noExpiryLabel,
    daysAfterIssueLabel: (days) =>
      safeT("gift_portrait_expiry_days_after_issue", {
        fallbackKo: `발급 후 ${days}일`,
        fallbackEn: `${days} days after issue`,
        vars: { days: String(days) },
      }),
  });

  return (
    <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS} data-gift-detail="1" data-ready="1">
      <GiftVisualCard
        className="mb-3"
        size="lg"
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
        expirationDisplay={expirationDisplay}
        showValidity={Boolean(expirationDisplay)}
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
              fallbackKo: "보유 포인트",
              fallbackEn: "Your Point",
            })}
          </span>
          {balanceLoading ? (
            <span className="tabular-nums font-semibold text-sam-fg">…</span>
          ) : (
            <CurrencyAmount currency="point" amount={balance} compactPoint className="text-sm" />
          )}
        </div>
        {appleOnly > 0 && !balanceLoading ? (
          <>
            <div className="mt-1 flex items-center justify-between gap-2 text-sm" data-gift-point-usable="1">
              <span className="text-sam-muted">
                {safeT("gift_u2_detail_usable_label", {
                  fallbackKo: "이 결제에 사용 가능",
                  fallbackEn: "Usable for this payment",
                })}
              </span>
              <CurrencyAmount currency="point" amount={generalAvailable} compactPoint className="text-sm" />
            </div>
            <p className="mt-1 text-xs text-sam-muted">
              {safeT("gift_u2_detail_apple_only_note", {
                fallbackKo: `Apple 결제로 충전한 ${appleOnly.toLocaleString()}P는 광고·홍보에만 사용할 수 있습니다.`,
                fallbackEn: `${appleOnly.toLocaleString()}P charged through Apple can only be used for ads and promotions.`,
                vars: { apple: appleOnly.toLocaleString() },
              })}
            </p>
          </>
        ) : null}
        <div className="mt-1 flex items-center justify-between gap-2 text-sm">
          <span className="text-sam-muted">
            {safeT("gift_u2_detail_need_label", {
              fallbackKo: "구매 필요",
              fallbackEn: "Required",
            })}
          </span>
          <CurrencyAmount
            currency="point"
            amount={product.purchasePrice}
            compactPoint
            className="text-sm"
          />
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
        {expirationDisplay ? (
          <p className="text-sm font-medium text-sam-fg" data-gift-detail-expiry="1">
            {safeT("gift_portrait_expiry_label", {
              fallbackKo: "유효기간",
              fallbackEn: "Valid until",
            })}
            {": "}
            {expirationDisplay}
          </p>
        ) : null}
        <p className="text-xs text-sam-muted">
          {safeT("gift_u2_detail_terms", {
            fallbackKo:
              "상품권은 포인트로만 구매할 수 있습니다. 구매 후 잔액은 해당 매장 주문에서 사용할 수 있습니다.",
            fallbackEn:
              "Gift certificates can only be purchased with Point. Remaining balance can be used at this store’s orders.",
          })}
        </p>
      </div>

      <DibayDialog
        open={confirmOpen}
        onClose={() => {
          if (!busy) setConfirmOpen(false);
        }}
        dismissible={!busy}
        title={safeT("popup_q_buy_gift_amount", {
          vars: { amount: product.purchasePrice.toLocaleString() },
        })}
        footer={
          <div className={OverlayUi.actionsRow}>
            <DibayOverlayButton
              roleTone="secondary"
              disabled={busy}
              onClick={() => setConfirmOpen(false)}
            >
              {safeT("common_cancel")}
            </DibayOverlayButton>
            <DibayOverlayButton
              roleTone="primary"
              disabled={busy}
              data-gift-confirm-submit="1"
              onClick={() => void purchase()}
            >
              {busy
                ? safeT("gift_u2_confirm_pending", {
                    fallbackKo: "구매 중…",
                    fallbackEn: "Purchasing…",
                  })
                : safeT("popup_btn_buy")}
            </DibayOverlayButton>
          </div>
        }
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
            size="sm"
            title={productDisplayTitle}
            issuerName={product.storeName}
            faceValue={product.faceValue}
            purchasePrice={product.purchasePrice}
            expirationDisplay={expirationDisplay}
            showValidity={Boolean(expirationDisplay)}
          />
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
        footer={
          <div className={OverlayUi.actionsRow}>
            <DibayOverlayButton
              roleTone="secondary"
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
            </DibayOverlayButton>
            <DibayOverlayButton
              roleTone="primary"
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
            </DibayOverlayButton>
          </div>
        }
      >
        <div className="mt-3 space-y-3" data-gift-purchase-success="1">
          {purchasedGiftNumber ? (
            <p
              className={`${OverlayUi.body} ${OverlayUi.bodySecondary} tabular-nums`}
              style={{ color: "var(--overlay-text-primary)" }}
              data-gift-public-number={purchasedGiftNumber}
            >
              {purchasedGiftNumber}
            </p>
          ) : null}
        </div>
      </DibayDialog>
    </div>
  );
}
