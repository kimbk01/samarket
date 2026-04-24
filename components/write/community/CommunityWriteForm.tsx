"use client";

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
import { PHILIFE_FB_INPUT_CLASS, PHILIFE_FB_TEXTAREA_CLASS } from "@/lib/philife/philife-flat-ui-classes";

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
    if (!title.trim()) next.title = "제목을 입력해 주세요.";
    if (!content.trim()) next.content = "내용을 입력해 주세요.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [title, content]);

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
    <div
      className={
        embeddedTier1 || suppressTier1Chrome
          ? "flex w-full min-w-0 flex-col bg-[#F7F8FA] pb-24"
          : "min-h-screen bg-[#F7F8FA] pb-24"
      }
    >
      {!suppressTier1Chrome ? (
        <WriteScreenTier1Sync
          tier1Mode={embeddedTier1 ? "embedded" : "global"}
          title={`${category.name} · 글쓰기`}
          backHref={backHref}
          onRequestClose={onCancel}
        />
      ) : null}
      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-[480px] md:max-w-2xl lg:max-w-3xl"
      >
        <ImageUploader value={images} onChange={setImages} label="사진 (선택)" />
        <section className="border-b border-[#E5E7EB] bg-white px-4 py-4">
          <label className="mb-2 block text-[14px] font-semibold text-[#1F2430]">
            제목 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목"
            maxLength={100}
            className={`w-full ${PHILIFE_FB_INPUT_CLASS}`}
            aria-invalid={!!errors.title}
          />
          {errors.title && <p className="mt-1 text-[12px] text-[#E25555]">{errors.title}</p>}
        </section>
        <section className="border-b border-[#E5E7EB] bg-white px-4 py-4">
          <label className="mb-2 block text-[14px] font-semibold text-[#1F2430]">
            내용 <span className="text-red-500">*</span>
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="내용을 입력해 주세요"
            rows={6}
            className={`w-full resize-none ${PHILIFE_FB_TEXTAREA_CLASS}`}
            aria-invalid={!!errors.content}
          />
          {errors.content && <p className="mt-1 text-[12px] text-[#E25555]">{errors.content}</p>}
        </section>
        {errors.submit && (
          <p className="px-4 py-2 text-[12px] text-[#E25555]">{errors.submit}</p>
        )}
        <SubmitButton label="등록하기" submitting={submitting} onCancel={onCancel} />
      </form>
    </div>
  );
}
