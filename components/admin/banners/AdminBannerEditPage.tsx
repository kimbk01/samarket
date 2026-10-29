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
import { AdminBannerPreview } from "./AdminBannerPreview";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";

interface AdminBannerEditPageProps {
  bannerId: string;
}

export function AdminBannerEditPage({ bannerId }: AdminBannerEditPageProps) {
  const router = useRouter();
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [banner, setBanner] = useState<AdminBanner | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** 불러오기 실패(코드·HTTP) — 「배너 없음(404)」과 구분해 표시한다. */
  const [loadError, setLoadError] = useState<{ code: string | null; httpStatus?: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/banners/${bannerId}`, {
        cache: "no-store",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; banner?: AdminBanner; error?: string };
      if (j.ok && j.banner) {
        setBanner(j.banner);
      } else {
        setBanner(null);
        if (res.status !== 404) setLoadError({ code: j.error ?? null, httpStatus: res.status });
      }
    } catch {
      setBanner(null);
      setLoadError({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, [bannerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <AdminLoadingState ko={ko} label={t("common_loading")} />;
  }

  if (loadError) {
    return <AdminErrorState ko={ko} code={loadError.code} httpStatus={loadError.httpStatus} onRetry={() => void load()} />;
  }

  if (!banner) {
    return <AdminEmptyState ko={ko} message={t("admin_banners_not_found")} />;
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
    if (saving) return;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: ko ? "배너 변경 내용을 저장할까요?" : "Save banner changes?",
      description: ko ? "저장하면 상태·노출 기간 설정대로 앱 노출이 바뀝니다." : "App exposure follows the saved status and period.",
      confirmLabel: adminCta("save", ko),
    });
    if (!confirmed.ok) return;
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
      <AdminPageHeader titleKey="admin_banners_page_edit" backHref="/admin/my/banners" />
      <AdminCard titleKey="admin_banners_card_info">
        <AdminBannerForm
          initial={initial}
          onSubmit={(v) => void handleSubmit(v)}
          submitLabel={saving ? t("common_loading") : t("common_save")}
        />
      </AdminCard>
      {/* 감사 AD-03·AD-08: 메뉴 밖 상세 화면에만 있던 미리보기를 편집 화면으로 (저장된 값 기준) */}
      <AdminCard titleKey="admin_banners_card_preview">
        <AdminBannerPreview banner={banner} />
      </AdminCard>
    </div>
  );
}
