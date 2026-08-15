"use client";

import { dibayAlert } from "@/components/ui/dibay-overlay";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminBannerForm, type AdminBannerFormValues } from "./AdminBannerForm";

export function AdminBannerCreatePage() {
  const router = useRouter();
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (values: AdminBannerFormValues) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/banners", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      const j = (await res.json()) as { ok?: boolean; banner?: { id?: string }; error?: string };
      if (!res.ok || !j.ok || !j.banner?.id) {
        await dibayAlert({ title: j.error ?? t("common_content_unavailable") });
        return;
      }
      router.push(`/admin/banners/${j.banner.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_banners_page_create" backHref="/admin/banners" />
      <AdminCard titleKey="admin_banners_card_info">
        <AdminBannerForm
          initial={null}
          onSubmit={(v) => void handleSubmit(v)}
          submitLabel={saving ? t("common_loading") : t("admin_banners_submit_register")}
        />
      </AdminCard>
    </div>
  );
}
