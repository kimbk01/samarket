"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { createPost } from "@/lib/posts/createPost";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import { WriteScreenTier1Sync } from "../WriteScreenTier1Sync";
import { useWriteScreenEmbeddedTier1 } from "../useWriteScreenEmbeddedTier1";
import { ImageUploader, type ImageUploadItem } from "../shared/ImageUploader";
import { TradeDefaultLocationBlock } from "../shared/TradeDefaultLocationBlock";
import { SubmitButton } from "../shared/SubmitButton";

/** post_type: 요청형(request/service_request 등) vs 글쓰기형(post/normal 등) */
function isRequestType(postType: string | undefined): boolean {
  if (!postType) return false;
  const t = postType.toLowerCase();
  return t === "request" || t === "service_request" || t === "요청";
}

interface ServiceWriteFormProps {
  category: CategoryWithSettings;
  onSuccess: (postId: string) => void;
  onCancel: () => void;
  suppressTier1Chrome?: boolean;
}

export function ServiceWriteForm({
  category,
  onSuccess,
  onCancel,
  suppressTier1Chrome = false,
}: ServiceWriteFormProps) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const embeddedTier1 = useWriteScreenEmbeddedTier1();
  const settings = category.settings;
  const postType = settings?.post_type ?? "post";
  const isRequest = isRequestType(postType);
  const hasLocation = settings?.has_location ?? true;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [contactMethod, setContactMethod] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const syncTradeRegionCity = useCallback((rid: string, cid: string) => {
    setRegion(rid);
    setCity(cid);
  }, []);
  const [images, setImages] = useState<ImageUploadItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (isRequest) {
      if (!content.trim()) next.content = t("ui_write_service_request_err");
    } else {
      if (!title.trim()) next.title = t("ui_product_err_title");
      if (!content.trim()) next.content = t("ui_write_service_desc_err");
    }
    if (hasLocation && !isRequest && (!region || !city)) {
      next.location =
        "거래 지역을 읽지 못했습니다. 주소 관리에서 대표 주소를 저장한 뒤 다시 시도해 주세요.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [isRequest, title, content, hasLocation, region, city, t]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;
      setSubmitting(true);
      try {
        const res = await createPost({
          type: "service",
          categoryId: category.id,
          title: isRequest ? content.trim().slice(0, 100) : title.trim(),
          content: content.trim(),
          contactMethod: isRequest ? contactMethod.trim() || undefined : undefined,
          region: region || undefined,
          city: city || undefined,
          barangay: undefined,
        });
        if (res.ok) {
          onSuccess(res.id);
        } else {
          if (redirectForBlockedAction(router, res.error, pathname || `/write/${category.slug}`)) return;
          setErrors({ submit: res.error });
        }
      } finally {
        setSubmitting(false);
      }
    },
    [
      category.id,
      isRequest,
      title,
      content,
      contactMethod,
      region,
      city,
      validate,
      onSuccess,
      router,
      pathname,
      category.slug,
    ]
  );

  const backHref = getCategoryHref(category);

  return (
    <div
      className={
        embeddedTier1 || suppressTier1Chrome
          ? "flex w-full min-w-0 flex-col bg-sam-app pb-24"
          : "min-h-screen bg-sam-app pb-24"
      }
    >
      {!suppressTier1Chrome ? (
        <WriteScreenTier1Sync
          tier1Mode={embeddedTier1 ? "embedded" : "global"}
          title={`${category.name} · ${t("ui_write_suffix_post")}`}
          backHref={backHref}
          onRequestClose={onCancel}
        />
      ) : null}
      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-[480px] md:max-w-2xl lg:max-w-3xl"
      >
        {!isRequest && (
          <ImageUploader value={images} onChange={setImages} label={t("ui_write_photos_label")} />
        )}
        {isRequest ? (
          <>
            <section className="border-b border-sam-border-soft bg-sam-surface px-4 py-4">
              <label className="mb-2 block sam-text-body font-medium text-sam-fg">
                {t("ui_write_service_request_label")} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t("ui_write_service_title_ph")}
                rows={5}
                className="w-full resize-none rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body text-sam-fg"
                aria-invalid={!!errors.content}
              />
              {errors.content && (
                <p className="mt-1 sam-text-body-secondary text-red-500">{errors.content}</p>
              )}
            </section>
            <section className="border-b border-sam-border-soft bg-sam-surface px-4 py-4">
              <label className="mb-2 block sam-text-body font-medium text-sam-fg">
                {t("ui_write_service_contact_label")}
              </label>
              <input
                type="text"
                value={contactMethod}
                onChange={(e) => setContactMethod(e.target.value)}
                placeholder={t("ui_write_service_contact_ph")}
                className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body text-sam-fg"
              />
            </section>
          </>
        ) : (
          <>
            <section className="border-b border-sam-border-soft bg-sam-surface px-4 py-4">
              <label className="mb-2 block sam-text-body font-medium text-sam-fg">
                {t("ui_write_title_label")} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("ui_write_title_ph")}
                maxLength={100}
                className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body text-sam-fg"
                aria-invalid={!!errors.title}
              />
              {errors.title && (
                <p className="mt-1 sam-text-body-secondary text-red-500">{errors.title}</p>
              )}
            </section>
            <section className="border-b border-sam-border-soft bg-sam-surface px-4 py-4">
              <label className="mb-2 block sam-text-body font-medium text-sam-fg">
                {t("ui_write_service_desc_label")} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t("ui_write_service_content_ph")}
                rows={5}
                className="w-full resize-none rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body text-sam-fg"
                aria-invalid={!!errors.content}
              />
              {errors.content && (
                <p className="mt-1 sam-text-body-secondary text-red-500">{errors.content}</p>
              )}
            </section>
            {hasLocation && (
              <TradeDefaultLocationBlock
                region={region}
                city={city}
                onSyncRegionCity={syncTradeRegionCity}
                error={errors.location}
              />
            )}
          </>
        )}
        {errors.submit && (
          <p className="px-4 py-2 sam-text-body-secondary text-red-500">{errors.submit}</p>
        )}
        <SubmitButton
          label={isRequest ? t("ui_write_service_request_submit") : t("community_write_submit")}
          submitting={submitting}
          onCancel={onCancel}
        />
      </form>
    </div>
  );
}
