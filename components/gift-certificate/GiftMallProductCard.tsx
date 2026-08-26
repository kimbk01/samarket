"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftArtwork } from "@/components/gift-certificate/GiftArtwork";
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
    <li
      className="min-w-0 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface"
      data-gift-mall-product={product.id}
    >
      <Link
        href={href}
        prefetch={false}
        className="flex min-w-0 gap-3 p-3"
        data-gift-mall-card-link={product.id}
      >
        <GiftArtwork src={product.imageUrl} alt={product.title} size={88} className="shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            {product.storeLogoUrl ? (
              <GiftArtwork
                src={product.storeLogoUrl}
                alt=""
                size={20}
                className="shrink-0"
                roundedClassName="rounded-full"
              />
            ) : null}
            <p className="min-w-0 truncate text-xs text-sam-muted">{product.storeName}</p>
          </div>
          <p className="truncate text-sm font-semibold text-sam-fg">{product.title}</p>
          <p className="text-xs text-sam-muted">
            {safeT("gift_u2_mall_face", { fallbackKo: "액면", fallbackEn: "Face value" })}{" "}
            <span className="tabular-nums text-sam-fg">{product.faceValue.toLocaleString()}</span>
          </p>
          <p className="text-sm font-medium text-sam-fg">
            {safeT("gift_u2_mall_price", { fallbackKo: "구매가", fallbackEn: "Price" })}{" "}
            <span className="tabular-nums">{product.purchasePrice.toLocaleString()} Point</span>
          </p>
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
          <span className={`${Sam.btn.secondary} mt-1 inline-flex min-h-[40px] w-full items-center justify-center px-3 text-sm`}>
            {safeT("gift_u2_mall_card_view", {
              fallbackKo: "상품권 보기",
              fallbackEn: "View gift",
            })}
          </span>
        </div>
      </Link>
    </li>
  );
}
