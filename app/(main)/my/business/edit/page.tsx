"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getBusinessProfileByOwnerUserId,
  updateBusinessProfile,
  CURRENT_USER_ID,
} from "@/lib/business/mock-business-profiles";
import { BusinessProfileEditForm, type BusinessProfileEditFormValues } from "@/components/business/BusinessProfileEditForm";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export default function BusinessEditRoute() {
  const router = useRouter();
  const { t } = useI18n();
  const profile = getBusinessProfileByOwnerUserId(CURRENT_USER_ID);

  if (!profile) {
    return (
      <div className="px-4 py-8 text-center sam-text-body text-sam-muted">
        {t("business_phase7_057")}
        <Link href="/stores/owner" className="ml-1 text-signature">
          {t("common_back_to_store")}
        </Link>
      </div>
    );
  }

  const handleSubmit = (values: BusinessProfileEditFormValues) => {
    updateBusinessProfile(profile.id, {
      shopName: values.shopName,
      description: values.description,
      phone: values.phone,
      kakaoId: values.kakaoId,
      region: values.region,
      city: values.city,
      addressStreetLine: values.addressStreetLine,
      addressDetail: values.addressDetail,
      category: values.category,
    });
    router.push("/stores/owner");
  };

  return (
    <div className="pt-1">
      <BusinessProfileEditForm
        profile={profile}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
