"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { createBanner } from "@/lib/admin-banners/mock-admin-banners";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminBannerForm, type AdminBannerFormValues } from "./AdminBannerForm";

const MOCK_ADMIN_ID = "admin-1";

export function AdminBannerCreatePage() {
  const router = useRouter();
  const { t } = useI18n();

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
      <AdminPageHeader titleKey="admin_banners_page_create" backHref="/admin/banners" />
      <AdminCard titleKey="admin_banners_card_info">
        <AdminBannerForm
          initial={null}
          onSubmit={handleSubmit}
          submitLabel={t("admin_banners_submit_register")}
        />
      </AdminCard>
    </div>
  );
}
