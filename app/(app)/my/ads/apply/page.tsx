"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import {
  createAdApplication,
  CURRENT_USER_ID,
} from "@/lib/ads/mock-ad-applications";
import { getMyProducts } from "@/lib/products/my-products-mock";
import { getBusinessProfileByOwnerUserId } from "@/lib/business/mock-business-profiles";
import { AdApplyForm, type AdApplyFormValues } from "@/components/ads/AdApplyForm";

const MOCK_NICKNAME = "KASAMA";

export default function MyAdsApplyPage() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const productOptions = useMemo(() => {
    const products = getMyProducts(CURRENT_USER_ID, "all");
    return products.map((p) => ({ id: p.id, title: p.title }));
  }, []);
  const shopOptions = useMemo(() => {
    const profile = getBusinessProfileByOwnerUserId(CURRENT_USER_ID);
    if (!profile || profile.status !== "active") return [];
    return [{ id: profile.id, shopName: profile.shopName }];
  }, []);

  const handleSubmit = (values: AdApplyFormValues) => {
    setSubmitError(null);
    const app = createAdApplication({
      applicantUserId: CURRENT_USER_ID,
      applicantNickname: MOCK_NICKNAME,
      targetType: values.targetType,
      targetId: values.targetId,
      placement: values.placement,
      planId: values.planId,
      paymentMethod: values.paymentMethod,
      applicantMemo: values.applicantMemo,
    });
    if (!app) {
      setSubmitError("선택한 광고 플랜을 찾을 수 없어요. 다시 시도해 주세요.");
      return;
    }
    router.push("/my/ads");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton backHref="/my/ads" />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">
          광고 신청
        </h1>
        <span className="w-11 shrink-0" />
      </header>
      <div className="px-4 py-4">
        {submitError && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {submitError}
          </p>
        )}
        <AdApplyForm
          productOptions={productOptions}
          shopOptions={shopOptions}
          onSubmit={handleSubmit}
          submitLabel="신청하기"
        />
      </div>
    </div>
  );
}
