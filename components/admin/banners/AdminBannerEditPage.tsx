"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  const { t } = useI18n();
  const banner = getBannerForAdminById(bannerId);

  if (!banner) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        {t("admin_banners_not_found")}
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
      <AdminPageHeader titleKey="admin_banners_page_edit" backHref={`/admin/banners/${bannerId}`} />
      <AdminCard titleKey="admin_banners_card_info">
        <AdminBannerForm
          initial={initial}
          onSubmit={handleSubmit}
          submitLabel={t("common_save")}
        />
      </AdminCard>
    </div>
  );
}
