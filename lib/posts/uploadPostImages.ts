"use client";

import { getSupabaseClient } from "@/lib/supabase/client";

const BUCKET = "post-images";

/**
 * 업로드한 파일을 Storage에 올리고 public URL 배열 반환.
 * - Supabase Auth 미사용 시 Storage RLS에서 막힐 수 있음 → 아래 SQL로 정책 완화 필요
 * - 버킷 없거나 실패 시 빈 배열 반환 (글은 그대로 등록)
 */
export async function uploadPostImages(
  files: File[],
  userId: string
): Promise<string[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !files.length) return [];

  const ts = Date.now();
  const safeUserId = userId?.replace(/[^a-zA-Z0-9_-]/g, "") || "anon";

  const uploaded = await Promise.all(
    files.map(async (file, i) => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext : "jpg";
      const path = `${safeUserId}/${ts}-${i}.${safeExt}`;
      try {
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (error) return null;
        const {
          data: { publicUrl },
        } = supabase.storage.from(BUCKET).getPublicUrl(path);
        return publicUrl || null;
      } catch {
        return null;
      }
    })
  );

  return uploaded.filter((u): u is string => typeof u === "string" && u.length > 0);
}
