"use client";

const BUCKET = "post-images";

type UploadPostImageResponse =
  | { ok: true; url: string; path?: string }
  | { ok: false; error?: string };

/**
 * 거래 글 이미지 업로드 — 서버 API (upload-time canonical derivatives).
 */
export async function uploadPostImages(
  files: File[],
  _userId: string
): Promise<string[]> {
  if (!files.length) return [];

  const uploaded = await Promise.all(
    files.map(async (file) => {
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/posts/upload-image", {
          method: "POST",
          body: form,
          credentials: "include",
        });
        const json = (await res.json()) as UploadPostImageResponse;
        if (!res.ok || !json.ok || !json.url) return null;
        return json.url;
      } catch {
        return null;
      }
    })
  );

  return uploaded.filter((u): u is string => typeof u === "string" && u.length > 0);
}

/** @deprecated Direct client bucket upload removed — use uploadPostImages API. */
export const POST_IMAGES_BUCKET = BUCKET;
