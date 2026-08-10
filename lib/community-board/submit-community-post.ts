"use server";

import { redirect } from "next/navigation";
import type { PostCreatePayload } from "@/lib/community-board/types";
import { getCanonicalCommunityWriteHref } from "@/lib/categories/getCategoryHref";

/**
 * Legacy community-board write entry — PRODUCT CALLERS = 0 under Community Nav SSOT.
 * Canonical write: /philife/write → neighborhood-posts → community_posts.
 * DO NOT invoke the legacy posts-table writer from this path.
 */
export async function submitCommunityPost(_boardSlug: string, _payload: PostCreatePayload) {
  redirect(getCanonicalCommunityWriteHref());
}
