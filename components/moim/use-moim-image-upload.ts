"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { philifeUploadImageUrl } from "@/lib/philife/api";
import { uploadCommunityImageFile } from "@/lib/philife/client-image-resize";

/** 모임 사진 올리기 — 커뮤니티 사진 업로드 경로를 그대로 쓴다 (실패 문구는 모임 키) */
export function useMoimImageUpload(): {
  uploading: boolean;
  /** registrationRequired — 가입 진행 중 거절(「가입 이어하기」 창이 이미 열림). 호출처는 실패 토스트를 겹치지 않는다 (F2 2026-11-27) */
  upload: (files: File[]) => Promise<{ urls: string[]; failed: boolean; registrationRequired: boolean }>;
} {
  const { t } = useI18n();
  const [uploading, setUploading] = useState(false);
  const upload = useCallback(
    async (files: File[]) => {
      const urls: string[] = [];
      let failed = false;
      let registrationRequired = false;
      setUploading(true);
      try {
        for (const f of files) {
          const r = await uploadCommunityImageFile(philifeUploadImageUrl(), f, {
            network: t("moim_screen_upload_failed"),
            tooLarge: t("moim_screen_upload_too_large"),
            failed: t("moim_screen_upload_failed"),
          });
          if (r.ok) urls.push(r.url);
          else {
            failed = true;
            if (r.code === "signup_incomplete") {
              registrationRequired = true;
              break;
            }
          }
        }
      } finally {
        setUploading(false);
      }
      return { urls, failed, registrationRequired };
    },
    [t]
  );
  return { uploading, upload };
}
