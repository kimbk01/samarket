"use client";

import Image from "next/image";

export interface ProfileImageFieldProps {
  avatarUrl: string | null;
  onChangeUrl: (url: string) => void;
}

/**
 * 프로필 이미지: 현재는 avatar_url 직접 입력.
 * TODO: Supabase Storage 업로드 연동 시 uploadAvatar(file: File): Promise<string> 시그니처로 구현 후 여기서 호출
 */
export function ProfileImageField({ avatarUrl, onChangeUrl }: ProfileImageFieldProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-20 w-20 overflow-hidden rounded-full bg-gray-100">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt="프로필"
            fill
            className="object-cover"
            sizes="80px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[28px] text-gray-400">
            👤
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[12px] text-gray-500">이미지 URL</label>
        <input
          type="url"
          value={avatarUrl ?? ""}
          onChange={(e) => onChangeUrl(e.target.value.trim())}
          placeholder="https://..."
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
        />
      </div>
      <button
        type="button"
        className="text-[13px] font-medium text-signature"
        onClick={() => {}}
      >
        이미지 변경
      </button>
    </div>
  );
}
