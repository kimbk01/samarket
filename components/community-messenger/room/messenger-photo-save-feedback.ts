"use client";

/**
 * 메신저 사진 저장 — UI 호출부 공통(길게 누르기 메뉴·선택 저장 시트·사진 보기).
 *
 * - 구버전 앱(브라우저 모드): 인앱 브라우저로 넘기기 전에 「앱 업데이트가 필요해요」 확인을 받는다.
 *   「원본 열기」를 눌렀을 때만 기존 hand-off 경로(`saveMessengerImages`)로 진행한다.
 * - 결과 스낵바: 일부/전부 실패 → 「다시 시도」(실패한 장만), 권한 거부 → 「설정 열기」.
 * - 앱(native)·웹 저장은 현재 화면(방·뷰어)을 떠나지 않는다.
 */
import type { MessageKey } from "@/lib/i18n/messages";
import {
  messengerImageSaveNotice,
  resolveMessengerImageSaveMode,
  saveMessengerImages,
  type MessengerImageSaveOutcome,
} from "@/lib/community-messenger/attachment/messenger-image-save";
import { openMessengerAppSettings } from "@/lib/community-messenger/attachment/messenger-photo-library";
import {
  showMessengerSnackbar,
  type MessengerSnackbarOptions,
} from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { dibayConfirm, type DibayConfirmRequest } from "@/components/ui/dibay-overlay/DibayAppDialogProvider";

export type MessengerPhotoSaveTranslate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export type MessengerPhotoSaveFeedbackDeps = {
  t: MessengerPhotoSaveTranslate;
  /** 테스트 주입용 — 기본은 앱 공통 확인 다이얼로그. */
  confirm?: (req: DibayConfirmRequest) => Promise<boolean>;
  /** 테스트 주입용 — 기본은 네이티브 OS 앱 설정 열기. */
  openSettings?: () => Promise<boolean>;
  /** 테스트 주입용 — 기본은 메신저 스낵바. */
  notify?: (message: string, opts?: MessengerSnackbarOptions) => void;
};

/** 구버전 앱에서 원본 열기(화면 이동) 전에 묻는다. true 일 때만 진행. */
export function confirmMessengerBrowserPhotoHandOff(deps: MessengerPhotoSaveFeedbackDeps): Promise<boolean> {
  const confirm = deps.confirm ?? dibayConfirm;
  return confirm({
    title: deps.t("cm_ui_photo_save_update_title"),
    description: deps.t("cm_ui_photo_save_update_body"),
    confirmLabel: deps.t("cm_ui_photo_save_open_original"),
    cancelLabel: deps.t("common_cancel"),
  }).catch(() => false);
}

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
 * 원본 URL 들을 저장하고 결과를 알린다. 브라우저 모드에서 사용자가 취소하면 null.
 * 「다시 시도」는 같은 경로로 실패한 장만 재요청한다.
 */
export async function saveMessengerPhotosWithFeedback(
  urls: string[],
  deps: MessengerPhotoSaveFeedbackDeps
): Promise<MessengerImageSaveOutcome | null> {
  if (urls.length === 0) return null;
  const mode = await resolveMessengerImageSaveMode();
  if (mode === "browser" && !(await confirmMessengerBrowserPhotoHandOff(deps))) return null;
  const outcome = await saveMessengerImages(urls);
  presentMessengerImageSaveOutcome(outcome, {
    ...deps,
    retry: (failed) => {
      void saveMessengerPhotosWithFeedback(failed, deps);
    },
  });
  return outcome;
}
