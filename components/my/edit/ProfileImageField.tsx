"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";

export interface ProfileImageFieldProps {
  avatarUrl: string | null;
  onChangeUrl: (url: string | null) => void;
}

/**
 * 프로필 사진: Supabase Storage 업로드 (/api/me/profile/avatar) 후 public URL을 avatar_url 로 저장
 */
export function ProfileImageField({ avatarUrl, onChangeUrl }: ProfileImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const pickFile = () => inputRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/me/profile/avatar", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
      if (!res.ok || !data?.ok || !data.url) {
        setUploadError(data?.error || "업로드에 실패했습니다.");
        return;
      }
      invalidateMeProfileDedupedCache();
      onChangeUrl(data.url);
    } catch {
      setUploadError("업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={pickFile}
        disabled={uploading}
        className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-sam-surface-muted outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-signature disabled:opacity-60"
        aria-label="프로필 사진 선택"
      >
        {avatarUrl ? (
          <Image src={avatarUrl} alt="프로필" fill className="object-cover" sizes="80px" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[28px] text-sam-meta">👤</div>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(ev) => void onFile(ev)}
      />
      <p className="text-center text-[13px] font-medium text-signature">
        <button type="button" onClick={pickFile} disabled={uploading} className="underline disabled:opacity-60">
          {uploading ? "업로드 중…" : "사진에서 선택"}
        </button>
        {avatarUrl ? (
          <>
            {" · "}
            <button
              type="button"
              className="text-sam-muted underline"
              onClick={() => onChangeUrl(null)}
              disabled={uploading}
            >
              제거
            </button>
          </>
        ) : null}
      </p>
      {uploadError ? <p className="text-center text-[13px] text-red-600">{uploadError}</p> : null}
    </div>
  );
}
