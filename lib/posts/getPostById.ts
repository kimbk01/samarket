"use client";

import type { PostWithMeta } from "./schema";
import type { DetailSectionDTO } from "@/lib/posts/detail-sections/types";

export { normalizePostImages, normalizePostMeta, normalizePostPrice } from "./post-normalize";

export type PostDetailClientBundle = {
  post: PostWithMeta;
  /** 상세 API(`recommendSections=1`)와 동시에 계산 — 별도 `/detail-sections` 호출 불필요 */
  detailSections: DetailSectionDTO[];
};

/**
 * 거래 글 상세 — 서버 API (`/api/posts/.../detail`)로 조회.
 * `recommendSections=1` 로 하단 추천 섹션을 **같은 응답**에서 받아 두 번째 네트워크 호출을 없앤다.
 */
export async function getPostById(postId: string): Promise<PostDetailClientBundle | null> {
  const id = postId?.trim();
  if (!id || typeof window === "undefined") return null;

  try {
    const res = await fetch(
      `/api/posts/${encodeURIComponent(id)}/detail?recommendSections=1`,
      {
        credentials: "include",
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const raw = (await res.json()) as unknown;
    if (!raw || typeof raw !== "object") return null;

    const o = raw as Record<string, unknown>;
    if (typeof o.post === "object" && o.post != null && typeof (o.post as PostWithMeta).id === "string") {
      const detailSections = Array.isArray(o.detailSections)
        ? (o.detailSections as DetailSectionDTO[])
        : [];
      return { post: o.post as PostWithMeta, detailSections };
    }

    if (typeof o.id === "string") {
      return { post: o as PostWithMeta, detailSections: [] };
    }

    return null;
  } catch {
    return null;
  }
}
