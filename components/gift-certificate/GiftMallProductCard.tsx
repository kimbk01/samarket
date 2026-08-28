"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftVisualCard } from "@/components/gift-certificate/GiftVisualCard";
import type { GiftMallProduct } from "@/lib/gift-certificate/load-gift-mall-products";
import { COMMERCE_PRIMARY_BTN_CLASS } from "@/components/orders/customer-commerce/CommerceHubSegmentTabs";

export function GiftMallProductCard({
  product,
  href,
}: {
  product: GiftMallProduct;
  href: string;
}) {
  const { safeT } = useI18n();
  const displayTitle = product.title;
  return (
    <li className="min-w-0 list-none" data-gift-mall-product={product.id}>
      <Link href={href} prefetch={false} className="block min-w-0" data-gift-mall-card-link={product.id}>
        <GiftVisualCard
          visual={{
            giftScope: product.giftScope,
            imageUrl: product.imageUrl,
            storeLogoUrl: product.storeLogoUrl,
            storeName: product.storeName,
            title: displayTitle,
          }}
          surface="mall"
          title={displayTitle}
          issuerName={product.storeName}
          faceValue={product.faceValue}
          purchasePrice={product.purchasePrice}
          footer={
            <div className="space-y-2">
              <p className="text-xs text-sam-muted">
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
              <span
                className={`${COMMERCE_PRIMARY_BTN_CLASS} pointer-events-none min-h-[40px] w-full`}
              >
                {safeT("gift_u2_mall_card_view", {
                  fallbackKo: "상품권 보기",
                  fallbackEn: "View gift",
                })}
              </span>
            </div>
          }
        />
      </Link>
    </li>
  );
}
