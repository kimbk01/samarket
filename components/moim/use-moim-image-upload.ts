"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { philifeUploadImageUrl } from "@/lib/philife/api";
import { uploadCommunityImageFile } from "@/lib/philife/client-image-resize";

/** 모임 사진 올리기 — 커뮤니티 사진 업로드 경로를 그대로 쓴다 (실패 문구는 모임 키) */
export function useMoimImageUpload(): {
  uploading: boolean;
  upload: (files: File[]) => Promise<{ urls: string[]; failed: boolean }>;
} {
  const { t } = useI18n();
  const [uploading, setUploading] = useState(false);
  const upload = useCallback(
    async (files: File[]) => {
      const urls: string[] = [];
      let failed = false;
      setUploading(true);
      try {
        for (const f of files) {
          const r = await uploadCommunityImageFile(philifeUploadImageUrl(), f, {
            network: t("moim_screen_upload_failed"),
            tooLarge: t("moim_screen_upload_too_large"),
            failed: t("moim_screen_upload_failed"),
          });
          if (r.ok) urls.push(r.url);
          else failed = true;
        }
      } finally {
        setUploading(false);
      }
      return { urls, failed };
    },
    [t]
  );
  return { uploading, upload };
}
