"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftVisualCard } from "@/components/gift-certificate/GiftVisualCard";
import type { GiftMallProduct } from "@/lib/gift-certificate/load-gift-mall-products";
import { Sam } from "@/lib/ui/sam-component-classes";

export function GiftMallProductCard({
  product,
  href,
}: {
  product: GiftMallProduct;
  href: string;
}) {
  const { safeT } = useI18n();
  return (
    <li className="min-w-0 list-none" data-gift-mall-product={product.id}>
      <Link href={href} prefetch={false} className="block min-w-0" data-gift-mall-card-link={product.id}>
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
          footer={
            <div className="space-y-1">
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
              <span className={`${Sam.btn.secondary} inline-flex min-h-[40px] w-full items-center justify-center px-3 text-sm`}>
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
