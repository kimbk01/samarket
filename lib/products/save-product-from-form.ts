"use client";

import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { createPost } from "@/lib/posts/createPost";
import { isRegistrationRequiredUploadFailure, uploadPostImagesDetailed } from "@/lib/posts/uploadPostImages";
import type { ProductFormPayload } from "@/lib/types/product-form";

/**
 * 상품 등록 폼 → posts(trade) 저장. 이미지는 Storage 업로드 후 URL로 저장.
 * 실패 시 `Error.message` = 오류 코드만(재감사 2026-11-27) — 화면은 `tradeWriteErrorText({ code: e.message }, t)`
 * (`lib/trade/trade-api-error-text.ts`)로 그린다. 한국어 문장을 던지지 않는다.
 */
export async function saveProductTradeFromForm(
  payload: ProductFormPayload
): Promise<string> {
  const userId = await getCurrentUserIdForDb();
  if (!userId) {
    throw new Error("login_required");
  }

  const files = payload.images.filter((x): x is File => typeof x !== "string");
  const existingUrls = payload.images.filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0
  );
  const uploadResults = await uploadPostImagesDetailed(files);
  const uploaded = uploadResults.flatMap((r) => (r.ok ? [r.url] : []));
  if (files.length > 0 && uploaded.length !== files.length) {
    /** 가입 진행 중 거절 — 화면이 「가입 이어하기」 창과 같은 문구 키(auth_reg_gate_title)로 그린다 (F2 2026-11-27) */
    if (isRegistrationRequiredUploadFailure(uploadResults)) throw new Error("signup_incomplete");
    throw new Error("upload_failed");
  }
  const imageUrls = [...existingUrls, ...uploaded];

  const categoryId = payload.category?.trim() ?? "";
  if (!categoryId) {
    throw new Error("category_required");
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
