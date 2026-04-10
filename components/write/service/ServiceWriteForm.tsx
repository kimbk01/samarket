"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { createPost } from "@/lib/posts/createPost";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import { WriteScreenTier1Sync } from "../WriteScreenTier1Sync";
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
}

export function ServiceWriteForm({ category, onSuccess, onCancel }: ServiceWriteFormProps) {
  const router = useRouter();
  const pathname = usePathname();
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
      if (!content.trim()) next.content = "요청 내용을 입력해 주세요.";
    } else {
      if (!title.trim()) next.title = "제목을 입력해 주세요.";
      if (!content.trim()) next.content = "설명을 입력해 주세요.";
    }
    if (hasLocation && !isRequest && (!region || !city)) {
      next.location =
        "거래 지역을 읽지 못했습니다. 주소 관리에서 대표 주소를 저장한 뒤 다시 시도해 주세요.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [isRequest, title, content, hasLocation, region, city]);

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
    <div className="min-h-screen bg-gray-50 pb-24">
      <WriteScreenTier1Sync title={`${category.name} · 글쓰기`} backHref={backHref} />
      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-[480px] md:max-w-2xl lg:max-w-3xl"
      >
        {!isRequest && (
          <ImageUploader value={images} onChange={setImages} label="사진" />
        )}
        {isRequest ? (
          <>
            <section className="border-b border-gray-100 bg-white px-4 py-4">
              <label className="mb-2 block text-[14px] font-medium text-gray-800">
                요청 내용 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="어떤 도움이 필요하신가요?"
                rows={5}
                className="w-full resize-none rounded-ui-rect border border-gray-300 px-3 py-2.5 text-[15px] text-gray-900"
                aria-invalid={!!errors.content}
              />
              {errors.content && (
                <p className="mt-1 text-[13px] text-red-500">{errors.content}</p>
              )}
            </section>
            <section className="border-b border-gray-100 bg-white px-4 py-4">
              <label className="mb-2 block text-[14px] font-medium text-gray-800">
                연락 방법
              </label>
              <input
                type="text"
                value={contactMethod}
                onChange={(e) => setContactMethod(e.target.value)}
                placeholder="채팅, 전화 등"
                className="w-full rounded-ui-rect border border-gray-300 px-3 py-2.5 text-[15px] text-gray-900"
              />
            </section>
          </>
        ) : (
          <>
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
                className="w-full rounded-ui-rect border border-gray-300 px-3 py-2.5 text-[15px] text-gray-900"
                aria-invalid={!!errors.title}
              />
              {errors.title && (
                <p className="mt-1 text-[13px] text-red-500">{errors.title}</p>
              )}
            </section>
            <section className="border-b border-gray-100 bg-white px-4 py-4">
              <label className="mb-2 block text-[14px] font-medium text-gray-800">
                설명 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="서비스 내용을 입력해 주세요"
                rows={5}
                className="w-full resize-none rounded-ui-rect border border-gray-300 px-3 py-2.5 text-[15px] text-gray-900"
                aria-invalid={!!errors.content}
              />
              {errors.content && (
                <p className="mt-1 text-[13px] text-red-500">{errors.content}</p>
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
          <p className="px-4 py-2 text-[13px] text-red-500">{errors.submit}</p>
        )}
        <SubmitButton
          label={isRequest ? "요청하기" : "등록하기"}
          submitting={submitting}
          onCancel={onCancel}
        />
      </form>
    </div>
  );
}
