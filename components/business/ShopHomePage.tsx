"use client";

import Link from "next/link";
import { getBusinessProfileBySlug } from "@/lib/business/mock-business-profiles";
import { getBusinessProducts } from "@/lib/business/mock-business-products";
import { BusinessProfileView } from "./BusinessProfileView";
import { BusinessProductList } from "./BusinessProductList";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { isUuidString } from "@/lib/shared/uuid-string";

interface ShopHomePageProps {
  slug: string;
}

export function ShopHomePage({ slug }: ShopHomePageProps) {
  const profile = getBusinessProfileBySlug(slug);

  if (!profile) {
    return (
      <div className="rounded-ui-rect bg-sam-surface p-8 text-center">
        <p className="sam-text-body text-sam-muted">상점을 찾을 수 없거나 비공개입니다.</p>
        <Link href="/" className="mt-3 inline-block sam-text-body text-signature">
          홈으로
        </Link>
      </div>
    );
  }

  const products = getBusinessProducts(profile.id);
  const operatorOk = isUuidString(profile.ownerUserId);
  const me = getCurrentUser()?.id ?? "";
  const isOwner = !!me && profile.ownerUserId === me;

  return (
    <div className="space-y-6">
      <BusinessProfileView profile={profile} isOwner={false} />
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-center space-y-2">
        {!operatorOk && (
          <p className="sam-text-helper text-sam-muted">
            상점 운영자 계정(ownerUserId)이 로그인 UUID와 연결되면 운영 기능을 더 넓힐 수 있어요.
          </p>
        )}
        {!isOwner && operatorOk ? (
          <p className="sam-text-helper text-sam-muted">채팅 문의 기능은 현재 비활성화되어 있습니다.</p>
        ) : null}
        <button
          type="button"
          className="rounded-full border border-signature bg-sam-surface px-4 py-2 sam-text-body font-medium text-signature"
        >
          팔로우 (예정)
        </button>
      </div>
      <div>
        <h2 className="mb-3 sam-text-body font-semibold text-sam-fg">
          상품 ({profile.productCount})
        </h2>
        <BusinessProductList
          products={products}
          shopSlug={profile.slug}
          emptyMessage="등록된 상품이 없습니다."
        />
      </div>
    </div>
  );
}
