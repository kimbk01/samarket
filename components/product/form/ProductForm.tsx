"use client";

import { useCallback, useState } from "react";
import type {
  ProductCondition,
  ProductFormInitialValues,
  ProductFormPayload,
} from "@/lib/types/product-form";
import { ProductImagePicker, type ImagePreviewItem } from "./ProductImagePicker";
import { ProductCategorySelect } from "./ProductCategorySelect";
import { ProductLocationSelect } from "./ProductLocationSelect";
import { ProductConditionSelect } from "./ProductConditionSelect";
import { ProductPriceField } from "./ProductPriceField";

const defaultCondition: ProductCondition = "good";

function toPreviewItems(images: (File | string)[]): ImagePreviewItem[] {
  return images.map((img) =>
    typeof img === "string"
      ? { url: img }
      : { file: img, url: URL.createObjectURL(img) }
  );
}

export interface ProductFormProps {
  initialValues?: ProductFormInitialValues;
  onSubmitSuccess?: (id: string) => void;
  onCancel?: () => void;
  saveProduct: (payload: ProductFormPayload) => Promise<string>;
}

export function ProductForm({
  initialValues,
  onSubmitSuccess,
  onCancel,
  saveProduct,
}: ProductFormProps) {
  const [images, setImages] = useState<ImagePreviewItem[]>(() =>
    initialValues?.images?.length ? toPreviewItems(initialValues.images) : []
  );
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [price, setPrice] = useState(initialValues?.price ?? "");
  const [category, setCategory] = useState(initialValues?.category ?? "");
  const [region, setRegion] = useState(initialValues?.region ?? "");
  const [city, setCity] = useState(initialValues?.city ?? "");
  const [barangay, setBarangay] = useState(initialValues?.barangay ?? "");
  const [condition, setCondition] = useState<ProductCondition>(
    (initialValues?.condition as ProductCondition) ?? defaultCondition
  );
  const [isPriceOfferEnabled, setIsPriceOfferEnabled] = useState(
    initialValues?.isPriceOfferEnabled ?? false
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "제목을 입력해 주세요.";
    if (!description.trim()) next.description = "설명을 입력해 주세요.";
    const priceNum = price.trim() ? Number(price.replace(/,/g, "")) : NaN;
    if (!price.trim() || isNaN(priceNum) || priceNum < 0)
      next.price = "가격을 입력해 주세요.";
    if (!category) next.category = "카테고리를 선택해 주세요.";
    if (!region || !city) next.region = "거래 지역과 동네를 선택해 주세요.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [title, description, price, category, region, city]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;
      setSubmitting(true);
      try {
        const payload: ProductFormPayload = {
          images: images.map((x) => (x.file ?? x.url) as File | string),
          title: title.trim(),
          description: description.trim(),
          price: price.trim().replace(/,/g, ""),
          category,
          region,
          city,
          barangay,
          condition,
          isPriceOfferEnabled,
        };
        const id = await saveProduct(payload);
        onSubmitSuccess?.(id);
      } finally {
        setSubmitting(false);
      }
    },
    [
      images,
      title,
      description,
      price,
      category,
      region,
      city,
      barangay,
      condition,
      isPriceOfferEnabled,
      validate,
      saveProduct,
      onSubmitSuccess,
    ]
  );

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-lg pb-24">
      <ProductImagePicker value={images} onChange={setImages} />
      <section className="border-b border-gray-100 bg-white px-4 py-4">
        <label className="mb-2 block text-[14px] font-medium text-gray-800">
          제목 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="상품 제목"
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
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="상품 설명"
          rows={5}
          className="w-full resize-none rounded-ui-rect border border-gray-300 px-3 py-2.5 text-[15px] text-gray-900"
          aria-invalid={!!errors.description}
        />
        {errors.description && (
          <p className="mt-1 text-[13px] text-red-500">{errors.description}</p>
        )}
      </section>
      <ProductPriceField
        value={price}
        onChange={setPrice}
        isPriceOfferEnabled={isPriceOfferEnabled}
        onPriceOfferChange={setIsPriceOfferEnabled}
        error={errors.price}
      />
      <ProductCategorySelect
        value={category}
        onChange={setCategory}
        error={errors.category}
      />
      <ProductLocationSelect
        region={region}
        city={city}
        onRegionChange={setRegion}
        onCityChange={(v) => {
          setCity(v);
          setBarangay(v);
        }}
        error={errors.region}
      />
      <ProductConditionSelect value={condition} onChange={setCondition} />
      <div className="fixed bottom-0 left-0 right-0 flex gap-2 border-t border-gray-100 bg-white px-4 py-3 max-w-lg mx-auto">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-ui-rect border border-gray-300 px-4 py-2.5 text-[15px] text-gray-600"
          >
            취소
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-ui-rect bg-signature py-2.5 text-[15px] font-medium text-white disabled:opacity-50"
        >
          {submitting ? "등록 중…" : "등록하기"}
        </button>
      </div>
    </form>
  );
}
