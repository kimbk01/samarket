"use client";

import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { createPost } from "@/lib/posts/createPost";
import { uploadPostImages } from "@/lib/posts/uploadPostImages";
import type { ProductFormPayload } from "@/lib/types/product-form";

/**
 * 상품 등록 폼 → posts(trade) 저장. 이미지는 Storage 업로드 후 URL로 저장.
 */
export async function saveProductTradeFromForm(
  payload: ProductFormPayload
): Promise<string> {
  const userId = await getCurrentUserIdForDb();
  if (!userId) {
    throw new Error("로그인이 필요합니다. Supabase 로그인 후 다시 시도해 주세요.");
  }

  const files = payload.images.filter((x): x is File => typeof x !== "string");
  const existingUrls = payload.images.filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0
  );
  const uploaded = await uploadPostImages(files, userId);
  if (files.length > 0 && uploaded.length !== files.length) {
    throw new Error(
      `이미지 ${files.length}장 중 ${uploaded.length}장만 업로드되었습니다. 네트워크·저장소 설정을 확인한 뒤 다시 시도해 주세요.`
    );
  }
  const imageUrls = [...existingUrls, ...uploaded];

  const categoryId = payload.category?.trim() ?? "";
  if (!categoryId) {
    throw new Error("카테고리를 선택해 주세요.");
  }

  const priceNum =
    Number(String(payload.price ?? "").replace(/,/g, "").trim()) || 0;

  const res = await createPost({
    type: "trade",
    categoryId,
    title: payload.title.trim(),
    content: payload.description.trim(),
    price: priceNum,
    isPriceOfferEnabled: payload.isPriceOfferEnabled,
    region: payload.region?.trim() || undefined,
    city: payload.city?.trim() || undefined,
    barangay: payload.barangay?.trim() || undefined,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    meta: { condition: payload.condition },
  });

  if (!res.ok) {
    throw new Error(res.error);
  }
  return res.id;
}
