"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminDestinationResolvedHint } from "@/components/admin/destination/AdminDestinationResolvedHint";
import type { BannerPlacement, BannerStatus } from "@/lib/types/admin-banner";
import { ADMIN_BANNER_STATUS_KEYS } from "./admin-banner-i18n";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import {
  adminIsoToManilaInput,
  adminManilaInputToIso,
} from "@/lib/admin/operator-ux/admin-manila-datetime-input";

/** MyPage CMS only — 회원 내정보 홈 프로필 아래(MypageHomeCmsBanner → MyTopBanner)에 활성 1건 표시 (placement not selected in UI). */
const MYPAGE_BANNER_PLACEMENT: BannerPlacement = "mypage_top";

export interface AdminBannerFormValues {
  title: string;
  description: string;
  imageUrl: string;
  mobileImageUrl: string;
  targetUrl: string;
  placement: BannerPlacement;
  priority: number;
  startAt: string;
  endAt: string;
  adminMemo: string;
  status: BannerStatus;
}

const DEFAULT_VALUES: AdminBannerFormValues = {
  title: "",
  description: "",
  imageUrl: "",
  mobileImageUrl: "",
  targetUrl: "",
  placement: MYPAGE_BANNER_PLACEMENT,
  priority: 0,
  startAt: "",
  endAt: "",
  adminMemo: "",
  status: "draft",
};

interface AdminBannerFormProps {
  initial?: Partial<AdminBannerFormValues> | null;
  onSubmit: (values: AdminBannerFormValues) => void;
  submitLabel?: string;
}

export function AdminBannerForm({
  initial,
  onSubmit,
  submitLabel,
}: AdminBannerFormProps) {
  const { t } = useI18n();
  /** G-18: 마이페이지 배너 등록·수정(POST·PATCH) = ads 키 (이 폼은 /admin/my/banners 생성·편집 전용) */
  const adminAction = useAdminRouteAction("/admin/my/banners");
  const resolvedSubmitLabel = submitLabel ?? t("common_save");
  const [values, setValues] = useState<AdminBannerFormValues>({
    ...DEFAULT_VALUES,
    ...initial,
  });

  const [uploading, setUploading] = useState<null | "imageUrl" | "mobileImageUrl">(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** 감사 AD-08: URL 직접 입력 외에 파일 올리기 — 기존 관리자 이미지 업로드 API 재사용 */
  const uploadImage = async (field: "imageUrl" | "mobileImageUrl", file: File | undefined) => {
    if (!file) return;
    setUploading(field);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("purpose", "mypage_banner");
      const res = await fetch("/api/admin/feed-ads/upload", { method: "POST", body: fd, credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !j.ok || !j.url) {
        setUploadError(j.error ?? "upload_failed");
        return;
      }
      setValues((v) => ({ ...v, [field]: j.url as string }));
    } finally {
      setUploading(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminAction.allowed) return;
    onSubmit({ ...values, placement: MYPAGE_BANNER_PLACEMENT });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {uploadError ? (
        <p className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 sam-text-body text-sam-danger" role="alert">
          이미지를 올리지 못했습니다 ({uploadError})
        </p>
      ) : null}
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_banners_label_title")}
        </label>
        <input
          type="text"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
          placeholder={t("admin_banners_field_title_placeholder")}
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_banners_label_description")}
        </label>
        <textarea
          value={values.description}
          onChange={(e) =>
            setValues((v) => ({ ...v, description: e.target.value }))
          }
          rows={2}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
          placeholder={t("admin_banners_field_desc_placeholder")}
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_banners_field_image_desktop")}
        </label>
        <input
          type="text"
          value={values.imageUrl}
          onChange={(e) => setValues((v) => ({ ...v, imageUrl: e.target.value }))}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
          placeholder={t("admin_banners_field_image_desktop_placeholder")}
        />
        <label className="mt-1.5 inline-flex cursor-pointer items-center gap-2 sam-text-body-secondary text-sam-muted">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            disabled={uploading != null}
            onChange={(e) => {
              void uploadImage("imageUrl", e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <span className="inline-flex h-8 items-center rounded-ui-rect border border-[var(--admin-console-border)] px-2.5 text-[13px] font-semibold text-[var(--admin-console-fg)] hover:bg-[var(--admin-console-hover)]">
            {uploading === "imageUrl" ? t("common_loading") : "이미지 파일 올리기"}
          </span>
        </label>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_banners_field_image_mobile")}
        </label>
        <input
          type="text"
          value={values.mobileImageUrl}
          onChange={(e) =>
            setValues((v) => ({ ...v, mobileImageUrl: e.target.value }))
          }
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
          placeholder={t("admin_banners_field_image_mobile_placeholder")}
        />
        <label className="mt-1.5 inline-flex cursor-pointer items-center gap-2 sam-text-body-secondary text-sam-muted">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            disabled={uploading != null}
            onChange={(e) => {
              void uploadImage("mobileImageUrl", e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <span className="inline-flex h-8 items-center rounded-ui-rect border border-[var(--admin-console-border)] px-2.5 text-[13px] font-semibold text-[var(--admin-console-fg)] hover:bg-[var(--admin-console-hover)]">
            {uploading === "mobileImageUrl" ? t("common_loading") : "이미지 파일 올리기"}
          </span>
        </label>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_banners_label_click_url")}
        </label>
        <input
          type="text"
          value={values.targetUrl}
          onChange={(e) => setValues((v) => ({ ...v, targetUrl: e.target.value }))}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
          placeholder="https://..."
        />
        <AdminDestinationResolvedHint href={values.targetUrl} />
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_banners_field_priority")}
        </label>
        <input
          type="number"
          min={0}
          value={values.priority}
          onChange={(e) =>
            setValues((v) => ({ ...v, priority: parseInt(e.target.value, 10) || 0 }))
          }
          className="w-24 rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg">
            {t("admin_banners_field_start")} (PHT)
          </label>
          <input
            type="datetime-local"
            // 감사 AD-07: 칸은 필리핀 시간(PHT)으로 보이고 저장도 PHT 기준 — 예전에는 UTC 를 그대로 보여 8시간 어긋났다.
            value={adminIsoToManilaInput(values.startAt)}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                startAt: adminManilaInputToIso(e.target.value, initial?.startAt) ?? "",
              }))
            }
            className="w-full rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
          />
        </div>
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg">
            {t("admin_banners_field_end")} (PHT)
          </label>
          <input
            type="datetime-local"
            // 감사 AD-07: 칸은 필리핀 시간(PHT)으로 보이고 저장도 PHT 기준 — 예전에는 UTC 를 그대로 보여 8시간 어긋났다.
            value={adminIsoToManilaInput(values.endAt)}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                endAt: adminManilaInputToIso(e.target.value, initial?.endAt) ?? "",
              }))
            }
            className="w-full rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_banners_label_admin_memo")}
        </label>
        <textarea
          value={values.adminMemo}
          onChange={(e) =>
            setValues((v) => ({ ...v, adminMemo: e.target.value }))
          }
          rows={2}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
          placeholder={t("admin_banners_field_memo_placeholder")}
        />
      </div>
      {initial && "status" in initial && (
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg">
            {t("admin_banners_label_status")}
          </label>
          <select
            value={values.status}
            onChange={(e) =>
              setValues((v) => ({ ...v, status: e.target.value as BannerStatus }))
            }
            className="rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
          >
            {(Object.keys(ADMIN_BANNER_STATUS_KEYS) as BannerStatus[]).map((status) => (
              <option key={status} value={status}>
                {t(ADMIN_BANNER_STATUS_KEYS[status])}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex gap-2">
        <AdminActionButton
          type="submit"
          variant="primary"
          disabled={!adminAction.allowed}
          title={adminAction.reason ?? undefined}
        >
          {resolvedSubmitLabel}
        </AdminActionButton>
        {!adminAction.allowed && adminAction.reason ? (
          <span className="self-center text-[12px] text-sam-muted" data-admin-action-denied="1">
            {adminAction.reason}
          </span>
        ) : null}
      </div>
    </form>
  );
}
