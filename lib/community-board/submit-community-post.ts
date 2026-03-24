"use server";

import { redirect } from "next/navigation";
import { createPost } from "@/lib/community-board/api";
import type { PostCreatePayload } from "@/lib/community-board/types";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";

export async function submitCommunityPost(boardSlug: string, payload: PostCreatePayload) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) redirect("/login");
  const { id } = await createPost(payload, auth.userId);
  redirect(`/community/${boardSlug}/${id}`);
}
