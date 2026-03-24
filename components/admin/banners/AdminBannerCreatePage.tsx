"use client";

import { useRouter } from "next/navigation";
import { createBanner } from "@/lib/admin-banners/mock-admin-banners";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminBannerForm, type AdminBannerFormValues } from "./AdminBannerForm";

const MOCK_ADMIN_ID = "admin-1";

export function AdminBannerCreatePage() {
  const router = useRouter();

  const handleSubmit = (values: AdminBannerFormValues) => {
    const banner = createBanner({
      title: values.title,
      description: values.description,
      imageUrl: values.imageUrl,
      mobileImageUrl: values.mobileImageUrl,
      targetUrl: values.targetUrl,
      placement: values.placement,
      status: values.status,
      priority: values.priority,
      startAt: values.startAt,
      endAt: values.endAt,
      adminMemo: values.adminMemo,
      createdBy: MOCK_ADMIN_ID,
    });
    router.push(`/admin/banners/${banner.id}`);
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title="배너 등록" backHref="/admin/banners" />
      <AdminCard title="배너 정보">
        <AdminBannerForm
          initial={null}
          onSubmit={handleSubmit}
          submitLabel="등록"
        />
      </AdminCard>
    </div>
  );
}
