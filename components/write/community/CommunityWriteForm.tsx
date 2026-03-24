"use client";

import { useCallback, useState } from "react";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { createPost } from "@/lib/posts/createPost";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { WriteHeader } from "../WriteHeader";
import { ImageUploader, type ImageUploadItem } from "../shared/ImageUploader";
import { SubmitButton } from "../shared/SubmitButton";

interface CommunityWriteFormProps {
  category: CategoryWithSettings;
  onSuccess: (postId: string) => void;
  onCancel: () => void;
}

export function CommunityWriteForm({ category, onSuccess, onCancel }: CommunityWriteFormProps) {
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
          setErrors({ submit: res.error });
        }
      } finally {
        setSubmitting(false);
      }
    },
    [category.id, title, content, validate, onSuccess]
  );

  const backHref = getCategoryHref(category);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <WriteHeader categoryName={category.name} backHref={backHref} />
      <form onSubmit={handleSubmit} className="mx-auto max-w-[480px]">
        <ImageUploader value={images} onChange={setImages} label="사진 (선택)" />
        <section className="border-b border-gray-100 bg-white px-4 py-4">
          <label className="mb-2 block text-[14px] font-medium text-gray-800">
            제목 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목"
            maxLength={100}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-[15px] text-gray-900"
            aria-invalid={!!errors.title}
          />
          {errors.title && <p className="mt-1 text-[13px] text-red-500">{errors.title}</p>}
        </section>
        <section className="border-b border-gray-100 bg-white px-4 py-4">
          <label className="mb-2 block text-[14px] font-medium text-gray-800">
            내용 <span className="text-red-500">*</span>
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="내용을 입력해 주세요"
            rows={6}
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-[15px] text-gray-900"
            aria-invalid={!!errors.content}
          />
          {errors.content && <p className="mt-1 text-[13px] text-red-500">{errors.content}</p>}
        </section>
        {errors.submit && (
          <p className="px-4 py-2 text-[13px] text-red-500">{errors.submit}</p>
        )}
        <SubmitButton label="등록하기" submitting={submitting} onCancel={onCancel} />
      </form>
    </div>
  );
}
