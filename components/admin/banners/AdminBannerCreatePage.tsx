"use client";

import { dibayAlert } from "@/components/ui/dibay-overlay";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminBannerForm, type AdminBannerFormValues } from "./AdminBannerForm";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";

export function AdminBannerCreatePage() {
  const router = useRouter();
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (values: AdminBannerFormValues) => {
    if (saving) return;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: ko ? "배너를 등록할까요?" : "Register this banner?",
      description: ko ? "상태·노출 기간 설정대로 앱에 노출됩니다." : "It is shown in the app per its status and period.",
      confirmLabel: adminCta("save", ko),
    });
    if (!confirmed.ok) return;
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
        await dibayAlert({ title: j.error ? adminOperatorErrorMessage(j.error, ko) : t("common_content_unavailable") });
        return;
      }
      router.push("/admin/my/banners");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_banners_page_create" backHref="/admin/my/banners" />
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
