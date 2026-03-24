"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BusinessSubPageHeader } from "@/components/business/BusinessSubPageHeader";
import {
  getBusinessProfileByOwnerUserId,
  updateBusinessProfile,
  CURRENT_USER_ID,
} from "@/lib/business/mock-business-profiles";
import { BusinessProfileEditForm, type BusinessProfileEditFormValues } from "@/components/business/BusinessProfileEditForm";

export default function BusinessEditRoute() {
  const router = useRouter();
  const profile = getBusinessProfileByOwnerUserId(CURRENT_USER_ID);

  if (!profile) {
    return (
      <div className="px-4 py-8 text-center text-[14px] text-gray-500">
        상점 정보가 없습니다.
        <Link href="/my/business" className="ml-1 text-signature">
          내 상점으로
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
      addressLabel: values.addressLabel,
      category: values.category,
    });
    router.push("/my/business");
  };

  return (
    <>
      <BusinessSubPageHeader title="상점 정보 수정" backHref="/my/business" />
      <div className="px-4 pt-4">
        <BusinessProfileEditForm
          profile={profile}
          onSubmit={handleSubmit}
          submitLabel="저장"
        />
      </div>
    </>
  );
}
