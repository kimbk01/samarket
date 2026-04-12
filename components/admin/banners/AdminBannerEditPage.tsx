"use client";

import { useRouter } from "next/navigation";
import type { AdminBannerFormValues } from "./AdminBannerForm";
import { getBannerForAdminById, updateBanner } from "@/lib/admin-banners/mock-admin-banners";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminBannerForm } from "./AdminBannerForm";

interface AdminBannerEditPageProps {
  bannerId: string;
}

export function AdminBannerEditPage({ bannerId }: AdminBannerEditPageProps) {
  const router = useRouter();
  const banner = getBannerForAdminById(bannerId);

  if (!banner) {
    return (
      <div className="py-8 text-center text-[14px] text-sam-muted">
        배너를 찾을 수 없습니다.
      </div>
    );
  }

  const initial: AdminBannerFormValues = {
    title: banner.title,
    description: banner.description,
    imageUrl: banner.imageUrl,
    mobileImageUrl: banner.mobileImageUrl,
    targetUrl: banner.targetUrl,
    placement: banner.placement,
    priority: banner.priority,
    startAt: banner.startAt ?? "",
    endAt: banner.endAt ?? "",
    adminMemo: banner.adminMemo ?? "",
    status: banner.status,
  };

  const handleSubmit = (values: AdminBannerFormValues) => {
    updateBanner(bannerId, {
      title: values.title,
      description: values.description,
      imageUrl: values.imageUrl,
      mobileImageUrl: values.mobileImageUrl,
      targetUrl: values.targetUrl,
      placement: values.placement,
      priority: values.priority,
      startAt: values.startAt ? new Date(values.startAt).toISOString() : "",
      endAt: values.endAt ? new Date(values.endAt).toISOString() : "",
      adminMemo: values.adminMemo || undefined,
      status: values.status,
    });
    router.push(`/admin/banners/${bannerId}`);
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title="배너 수정" backHref={`/admin/banners/${bannerId}`} />
      <AdminCard title="배너 정보">
        <AdminBannerForm
          initial={initial}
          onSubmit={handleSubmit}
          submitLabel="저장"
        />
      </AdminCard>
    </div>
  );
}
