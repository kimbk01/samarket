"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import type { GiftMallProduct } from "@/lib/gift-certificate/load-gift-mall-products";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function GiftMallPage() {
  const { safeT } = useI18n();
  const [products, setProducts] = useState<GiftMallProduct[]>([]);
  const [ready, setReady] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/me/gift-certificates/mall", {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as { ok?: boolean; products?: GiftMallProduct[] };
    setProducts(json.ok ? json.products ?? [] : []);
    setReady(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const purchase = async (productId: string) => {
    setBusyId(productId);
    setMessage(null);
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `gift-purchase-${Date.now()}`;
    const res = await fetch("/api/me/gift-certificates/purchase", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, idempotencyKey }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    setBusyId(null);
    if (!json.ok) {
      setMessage(String(json.error ?? "purchase_failed"));
      return;
    }
    setMessage(
      safeT("gift_certificate_mall_purchase_ok", {
        fallbackKo: "구매가 완료되었습니다.",
        fallbackEn: "Purchase complete.",
      })
    );
  };

  return (
    <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS} data-gift-mall="1" data-ready={ready ? "1" : "0"}>
      <MySubpageHeader titleKey="gift_certificate_mall_title" backHref="/stores" />
      {message ? <p className="mb-3 text-sm text-sam-muted">{message}</p> : null}
      {products.length === 0 ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_certificate_mall_empty", {
            fallbackKo: "판매 중인 상품권이 없습니다.",
            fallbackEn: "No gift certificates on sale.",
          })}
        </p>
      ) : (
        <ul className="min-w-0 space-y-3 pb-8">
          {products.map((p) => (
            <li
              key={p.id}
              className="flex min-w-0 items-center justify-between gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3"
              data-gift-mall-product={p.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-sam-fg">{p.title}</p>
                <p className="text-xs text-sam-muted">{p.storeName}</p>
                <p className="text-sm text-sam-fg">
                  {p.purchasePrice.toLocaleString()} → {p.faceValue.toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                className="sam-btn-primary shrink-0 px-3 py-2 text-sm"
                disabled={busyId === p.id}
                onClick={() => void purchase(p.id)}
              >
                {safeT("gift_certificate_mall_buy", {
                  fallbackKo: "구매",
                  fallbackEn: "Buy",
                })}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
