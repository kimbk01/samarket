"use client";

import { dibayAlert } from "@/components/ui/dibay-overlay";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminBanner } from "@/lib/types/admin-banner";
import type { AdminBannerFormValues } from "./AdminBannerForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminBannerForm } from "./AdminBannerForm";

interface AdminBannerEditPageProps {
  bannerId: string;
}

export function AdminBannerEditPage({ bannerId }: AdminBannerEditPageProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [banner, setBanner] = useState<AdminBanner | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/banners/${bannerId}`, {
        cache: "no-store",
        credentials: "include",
      });
      const j = (await res.json()) as { ok?: boolean; banner?: AdminBanner };
      setBanner(j.ok && j.banner ? j.banner : null);
    } catch {
      setBanner(null);
    } finally {
      setLoading(false);
    }
  }, [bannerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>;
  }

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

  const handleSubmit = async (values: AdminBannerFormValues) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/banners/${bannerId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        await dibayAlert({ title: j.error ?? t("common_content_unavailable") });
        return;
      }
      router.push(`/admin/banners/${bannerId}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_banners_page_edit" backHref={`/admin/banners/${bannerId}`} />
      <AdminCard titleKey="admin_banners_card_info">
        <AdminBannerForm
          initial={initial}
          onSubmit={(v) => void handleSubmit(v)}
          submitLabel={saving ? t("common_loading") : t("common_save")}
        />
      </AdminCard>
    </div>
  );
}
