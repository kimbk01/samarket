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
import { SubmitButton } from "../shared/SubmitButton";
import { CM_INPUT_CLASS, CM_TEXTAREA_CLASS } from "@/lib/community/community-ui-classes";

interface CommunityWriteFormProps {
  category: CategoryWithSettings;
  onSuccess: (postId: string) => void;
  onCancel: () => void;
  suppressTier1Chrome?: boolean;
}

export function CommunityWriteForm({
  category,
  onSuccess,
  onCancel,
  suppressTier1Chrome = false,
}: CommunityWriteFormProps) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const embeddedTier1 = useWriteScreenEmbeddedTier1();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<ImageUploadItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = t("ui_product_err_title");
    if (!content.trim()) next.content = t("ui_write_err_content");
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [title, content, t]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;
      setSubmitting(true);
      try {
        const res = await createPost({
          type: "community",
          categoryId: category.id,
          title: title.trim(),
          content: content.trim(),
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
    [category.id, category.slug, title, content, validate, onSuccess, router, pathname]
  );

  const backHref = getCategoryHref(category);

  return (
    <div data-community-ui>
    <div
      className={
        embeddedTier1 || suppressTier1Chrome
          ? "flex w-full min-w-0 flex-col bg-[var(--cm-page-bg)] pb-24"
          : "min-h-screen bg-[var(--cm-page-bg)] pb-24"
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
        className="mx-auto w-full max-w-[480px] space-y-3 px-4 py-4 md:max-w-2xl lg:max-w-3xl"
      >
        <ImageUploader value={images} onChange={setImages} label={t("ui_write_photos_optional")} />
        <section className="sam-section">
          <label className="sam-form-label mb-2 block">
            {t("ui_write_title_label")} <span className="sam-form-required">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("ui_write_title_ph")}
            maxLength={100}
            className={`w-full ${CM_INPUT_CLASS}`}
            aria-invalid={!!errors.title}
          />
          {errors.title && <p className="mt-1 sam-text-helper text-sam-danger">{errors.title}</p>}
        </section>
        <section className="sam-section">
          <label className="sam-form-label mb-2 block">
            {t("ui_write_content_label")} <span className="sam-form-required">*</span>
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("ui_write_content_ph")}
            rows={6}
            className={`w-full resize-none ${CM_TEXTAREA_CLASS}`}
            aria-invalid={!!errors.content}
          />
          {errors.content && <p className="mt-1 sam-text-helper text-sam-danger">{errors.content}</p>}
        </section>
        {errors.submit && (
          <p className="sam-text-helper px-4 py-2 text-sam-danger">{errors.submit}</p>
        )}
        <SubmitButton label={t("community_write_submit")} submitting={submitting} onCancel={onCancel} />
      </form>
    </div>
    </div>
  );
}
