"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  createAdApplication,
  CURRENT_USER_ID,
} from "@/lib/ads/mock-ad-applications";
import { AdApplyForm, type AdApplyFormValues } from "@/components/ads/AdApplyForm";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { getBusinessProfileByOwnerUserId } from "@/lib/business/mock-business-profiles";
import { getMyProducts } from "@/lib/products/my-products-mock";

const MOCK_NICKNAME = "KASAMA";

export function MyAdsApplyPageClient() {
  const { t } = useI18n();
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
      setSubmitError(t("ads_apply_plan_not_found"));
      return;
    }
    router.push("/my/ads");
  };

  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("mypage_ads_apply_title")}
        subtitle={t("mypage_ads_apply_subtitle")}
        backHref="/my/ads"
        section="store"
        hideCtaStrip
      />
      <div className="mx-auto max-w-lg px-4 py-4">
        {submitError && (
          <p className="mb-4 rounded-ui-rect bg-red-50 px-3 py-2 sam-text-body-secondary text-red-700">
            {submitError}
          </p>
        )}
        <AdApplyForm
          productOptions={productOptions}
          shopOptions={shopOptions}
          onSubmit={handleSubmit}
          submitLabel={t("ads_apply_submit")}
        />
      </div>
    </div>
  );
}
