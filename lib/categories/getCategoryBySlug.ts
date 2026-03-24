"use client";

import { getCategoryBySlugOrId } from "./getCategoryById";

/**
 * slug로 카테고리 조회 (글쓰기 런처 등)
 */
export async function getCategoryBySlug(slug: string) {
  return getCategoryBySlugOrId(slug);
}
