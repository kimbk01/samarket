"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getBusinessProfileBySlug } from "@/lib/business/mock-business-profiles";
import { getBusinessProducts } from "@/lib/business/mock-business-products";
import { BusinessProfileView } from "./BusinessProfileView";
import { BusinessProductList } from "./BusinessProductList";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { startBusinessInquiry } from "@/lib/chat/startBusinessInquiry";
import { isUuidString } from "@/lib/shared/uuid-string";

interface ShopHomePageProps {
  slug: string;
}

export function ShopHomePage({ slug }: ShopHomePageProps) {
  const router = useRouter();
  const [inquiryBusy, setInquiryBusy] = useState(false);
  const [inquiryError, setInquiryError] = useState("");
  const profile = getBusinessProfileBySlug(slug);

  if (!profile) {
    return (
      <div className="rounded-lg bg-white p-8 text-center">
        <p className="text-[14px] text-gray-500">상점을 찾을 수 없거나 비공개입니다.</p>
        <Link href="/" className="mt-3 inline-block text-[14px] text-signature">
          홈으로
        </Link>
      </div>
    );
  }

  const products = getBusinessProducts(profile.id);
  const operatorOk = isUuidString(profile.ownerUserId);
  const me = getCurrentUser()?.id ?? "";
  const isOwner = !!me && profile.ownerUserId === me;

  const onShopInquiry = async () => {
    if (!operatorOk) return;
    const u = getCurrentUser();
    if (!u?.id) {
      router.push("/my/account");
      return;
    }
    if (u.id === profile.ownerUserId) return;
    setInquiryError("");
    setInquiryBusy(true);
    const res = await startBusinessInquiry({
      operatorUserId: profile.ownerUserId,
      businessKey: profile.id,
    });
    setInquiryBusy(false);
    if (res.ok) router.push(`/chats/${res.roomId}`);
    else setInquiryError(res.error);
  };

  return (
    <div className="space-y-6">
      <BusinessProfileView profile={profile} isOwner={false} />
      <div className="rounded-lg border border-gray-200 bg-white p-3 text-center space-y-2">
        {!isOwner && operatorOk && (
          <button
            type="button"
            onClick={() => void onShopInquiry()}
            disabled={inquiryBusy}
            className="w-full rounded-full bg-violet-600 px-4 py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
          >
            {inquiryBusy ? "연결 중…" : "문의하기"}
          </button>
        )}
        {!operatorOk && (
          <p className="text-[12px] text-gray-500">
            상점 운영자 계정(ownerUserId)이 로그인 UUID와 연결되면 문의하기를 사용할 수 있어요.
          </p>
        )}
        {inquiryError ? <p className="text-[12px] text-red-600">{inquiryError}</p> : null}
        <button
          type="button"
          className="rounded-full border border-signature bg-white px-4 py-2 text-[14px] font-medium text-signature"
        >
          팔로우 (예정)
        </button>
      </div>
      <div>
        <h2 className="mb-3 text-[15px] font-semibold text-gray-900">
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
