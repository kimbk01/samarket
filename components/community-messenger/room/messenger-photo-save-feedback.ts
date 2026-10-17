"use client";

/**
 * 메신저 사진 저장 — UI 호출부 공통(길게 누르기 메뉴·선택 저장 시트·사진 보기).
 *
 * - 구버전 앱(update_required, 네이티브 saveImages 없음): 화면 이동 없이 「앱 업데이트 필요」 스낵바만 낸다.
 *   1장이면 사용자가 직접 누르는 「원본 열기」 액션을 붙인다(저장 버튼이 Safari 로 자동 이동하지 않음).
 * - 결과 스낵바: 일부/전부 실패 → 「다시 시도」(실패한 장만), 권한 거부 → 「설정 열기」.
 * - 앱(native)·웹 저장은 현재 화면(방·뷰어)을 떠나지 않는다.
 */
import type { MessageKey } from "@/lib/i18n/messages";
import {
  messengerImageSaveNotice,
  openMessengerImageOriginalForManualSave,
  saveMessengerImages,
  type MessengerImageSaveOutcome,
} from "@/lib/community-messenger/attachment/messenger-image-save";
import { openMessengerAppSettings } from "@/lib/community-messenger/attachment/messenger-photo-library";
import {
  showMessengerSnackbar,
  type MessengerSnackbarOptions,
} from "@/lib/community-messenger/stores/messenger-snackbar-store";

export type MessengerPhotoSaveTranslate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export type MessengerPhotoSaveFeedbackDeps = {
  t: MessengerPhotoSaveTranslate;
  /** 테스트 주입용 — 기본은 네이티브 OS 앱 설정 열기. */
  openSettings?: () => Promise<boolean>;
  /** 테스트 주입용 — 기본은 구버전 앱 원본 열기(인앱 브라우저). */
  openOriginal?: (url: string) => boolean;
  /** 테스트 주입용 — 기본은 메신저 스낵바. */
  notify?: (message: string, opts?: MessengerSnackbarOptions) => void;
};

/** 저장 결과 스낵바 — 성공은 savedCount>0 일 때만(`messengerImageSaveNotice`). */
export function presentMessengerImageSaveOutcome(
  outcome: MessengerImageSaveOutcome,
  deps: MessengerPhotoSaveFeedbackDeps & { retry: (failedUrls: string[]) => void }
): void {
  const notify = deps.notify ?? showMessengerSnackbar;
  const notice = messengerImageSaveNotice(outcome);
  const text = deps.t(notice.key, notice.params);
  if (notice.action === "retry" && outcome.failedUrls && outcome.failedUrls.length > 0) {
    const failed = [...outcome.failedUrls];
    notify(text, {
      variant: notice.variant,
      action: { label: deps.t("cm_ui_photo_save_retry"), onPress: () => deps.retry(failed) },
    });
    return;
  }
  if (notice.action === "open_original" && outcome.manualOpenUrl) {
    const url = outcome.manualOpenUrl;
    const openOriginal = deps.openOriginal ?? openMessengerImageOriginalForManualSave;
    notify(text, {
      variant: notice.variant,
      action: { label: deps.t("cm_ui_photo_save_open_original"), onPress: () => void openOriginal(url) },
    });
    return;
  }
  if (notice.action === "open_settings") {
    const openSettings = deps.openSettings ?? openMessengerAppSettings;
    notify(text, {
      variant: notice.variant,
      action: {
        label: deps.t("cm_ui_photo_save_open_settings"),
        onPress: () => {
          void Promise.resolve()
            .then(() => openSettings())
            .catch(() => false)
            .then((opened) => {
              if (!opened) notify(deps.t("cm_ui_photo_save_open_settings_unavailable"), { variant: "default" });
            });
        },
      },
    });
    return;
  }
  notify(text, { variant: notice.variant });
}

/**
 * 원본 URL 들을 저장하고 결과를 알린다(빈 목록이면 null).
 * 「다시 시도」는 같은 경로로 실패한 장만 재요청한다.
 */
export async function saveMessengerPhotosWithFeedback(
  urls: string[],
  deps: MessengerPhotoSaveFeedbackDeps
): Promise<MessengerImageSaveOutcome | null> {
  if (urls.length === 0) return null;
  const outcome = await saveMessengerImages(urls);
  presentMessengerImageSaveOutcome(outcome, {
    ...deps,
    retry: (failed) => {
      void saveMessengerPhotosWithFeedback(failed, deps);
    },
  });
  return outcome;
}
